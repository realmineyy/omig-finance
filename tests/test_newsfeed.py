from datetime import datetime, timezone

from engine.newsfeed import FILING_TITLE, MACRO_PATTERN, parse_feed

RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Acme beats earnings</title><link>https://example.com/a</link>
        <guid>a-1</guid><pubDate>Wed, 23 Sep 2026 12:30:00 GMT</pubDate></item>
  <item><title>No link here</title></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Fed holds rates</title><link href="https://example.com/b"/>
         <id>b-1</id><updated>2026-09-23T12:31:00-04:00</updated></entry>
</feed>"""


def test_parses_rss_and_skips_entries_without_a_link():
    items = parse_feed("Test", RSS)
    assert len(items) == 1
    assert items[0]["title"] == "Acme beats earnings"
    assert items[0]["url"] == "https://example.com/a"
    assert items[0]["published"] == datetime(2026, 9, 23, 12, 30, tzinfo=timezone.utc)


def test_parses_atom_with_link_href_and_iso_dates():
    items = parse_feed("Test", ATOM)
    assert items[0]["url"] == "https://example.com/b"
    assert items[0]["published"].astimezone(timezone.utc).hour == 16  # 12:31 EDT


def test_filing_titles_keep_the_whole_form_name():
    assert FILING_TITLE.match("8-K - MCDONALDS CORP (0000063908) (Filer)")["form"] == "8-K"
    assert FILING_TITLE.match("SC 13D - Acme Inc. (0001234567) (Subject)")["form"] == "SC 13D"
    assert FILING_TITLE.match("8-K/A - Foo Corp (0000111111) (Filer)")["cik"] == "0000111111"


def test_macro_pattern_catches_market_wide_news_only():
    assert MACRO_PATTERN.search("Jobless claims fall to lowest level since May")
    assert MACRO_PATTERN.search("Stock market today: futures slip")
    assert not MACRO_PATTERN.search("Verisk Analytics positions well for expansion")
