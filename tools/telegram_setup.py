"""Connect the market-alert bot to your Telegram account.

    python3 tools/telegram_setup.py

Asks for your bot token, waits for you to message the bot, finds your chat id,
and sends a test alert. The token is never printed and never written to disk —
you paste it into GitHub's secret page yourself at the end.

Standard library only, so it runs with any python3.
"""
import argparse
import getpass
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.telegram.org/bot{token}/{method}"
WAIT_SECONDS = 300


def call(token: str, method: str, **params):
    """Call one Telegram Bot API method. Returns (ok, result_or_error_text)."""
    url = API.format(token=token, method=method)
    body = json.dumps(params).encode() if params else None
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
        return True, payload.get("result")
    except urllib.error.HTTPError as err:
        try:
            detail = json.load(err).get("description", "")
        except Exception:
            detail = err.reason
        return False, f"{err.code}: {detail}"
    except Exception as exc:  # network, DNS, timeout
        return False, str(exc)


def secrets_url() -> str:
    """The repo's secret page, from the git remote when there is one."""
    try:
        remote = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True,
                                text=True, check=True).stdout.strip()
    except Exception:
        return "https://github.com/<you>/<repo>/settings/secrets/actions"
    slug = remote.removesuffix(".git").split("github.com")[-1].lstrip(":/")
    return f"https://github.com/{slug}/settings/secrets/actions"


def ask_for_token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if token:
        print("Using the token from TELEGRAM_BOT_TOKEN.")
        return token
    print("In Telegram, message @BotFather → /newbot → follow the prompts → copy the token")
    print("it gives you (it looks like 8123456789:AAH...).\n")
    try:
        return getpass.getpass("Paste the bot token (hidden as you type, then press Return): ").strip()
    except (EOFError, KeyboardInterrupt):
        sys.exit("\nCancelled.")


def wait_for_message(token: str):
    """Long-poll until the user messages the bot. Returns the chat, or None."""
    deadline = time.time() + WAIT_SECONDS
    offset = None
    while time.time() < deadline:
        params = {"timeout": 25}
        if offset is not None:
            params["offset"] = offset
        ok, result = call(token, "getUpdates", **params)
        if not ok:
            print(f"  Telegram said: {result}")
            if "webhook" in str(result).lower():
                print("  A webhook is set on this bot, so getUpdates is blocked.")
                print("  Delete it with:  curl -s 'https://api.telegram.org/bot<TOKEN>/deleteWebhook'")
            return None
        for update in result or []:
            offset = update["update_id"] + 1
            message = update.get("message") or update.get("channel_post") or {}
            if chat := message.get("chat"):
                return chat
        print("  …still waiting", end="\r", flush=True)
    return None


def describe(chat: dict) -> str:
    name = chat.get("title") or " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x)
    return f"{name or 'your chat'} ({chat.get('type', 'private')})"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-test-message", action="store_true", help="skip sending the test alert")
    args = parser.parse_args()

    print("\n─── Telegram alert setup ───\n")
    token = ask_for_token()
    if not token:
        sys.exit("No token entered.")

    ok, me = call(token, "getMe")
    if not ok:
        print(f"\n✗ Telegram rejected that token ({me}).")
        sys.exit("  Check you copied the whole thing from @BotFather, then run this again.")
    username = me.get("username", "your bot")
    print(f"\n✓ Connected to @{username}\n")

    print(f"Now open Telegram, find @{username}, and send it any message (\"hi\" is fine).")
    print("If you want alerts in a group instead, add the bot to the group and post there.\n")
    chat = wait_for_message(token)
    if not chat:
        print("\n✗ No message arrived.")
        sys.exit(f"  Send @{username} a message, then run this again.")

    chat_id = chat["id"]
    print(f"\n✓ Found your chat: {describe(chat)}")
    print(f"\n    TELEGRAM_CHAT_ID = {chat_id}\n")

    if not args.no_test_message:
        ok, result = call(token, "sendMessage", chat_id=chat_id, parse_mode="HTML",
                          text="✅ <b>OMIG Research alerts connected.</b>\n"
                               "Morning briefs and breaking market moves will arrive here.")
        print("✓ Test message sent — check your phone." if ok else f"✗ Could not send a test message: {result}")

    print("\n─── Last step: add two repository secrets ───\n")
    print(f"  {secrets_url()}\n")
    print("  New repository secret → name: TELEGRAM_BOT_TOKEN   → value: the token you just pasted")
    print(f"  New repository secret → name: TELEGRAM_CHAT_ID    → value: {chat_id}\n")
    print("Then run Actions → Market alerts → Run workflow → test to confirm it works end to end.")
    print("The morning brief fires at 6:00am Central on weekdays; breaking alerts during market hours.\n")


if __name__ == "__main__":
    main()
