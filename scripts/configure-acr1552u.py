#!/usr/bin/env python3
"""Configure an ACS ACR1552U as HID keyboard wedge (UID + Enter) via PC/SC.

The reader ships in "Only CCID Reader" mode and types nothing until this
one-time configuration is written. Settings persist inside the reader.

Escape commands per ACR1552U Series Reference Manual V1.08, section 6.1.14:
  Get/Set Output Format    E0 00 00 90 ...
  Get/Set UID characters   E0 00 00 91 ...
  Get/Set Host Interface   E0 00 00 93 ...

Requires pyscard and a CCID driver that allows escape commands.
See docs/wedge-reader-setup.md for the full setup (macOS driver steps).

Usage:
  python3 configure-acr1552u.py --dry-run   # read current settings only
  python3 configure-acr1552u.py             # write the wedge configuration
"""

import sys

from smartcard.scard import (
    SCARD_CTL_CODE,
    SCARD_LEAVE_CARD,
    SCARD_PROTOCOL_RAW,
    SCARD_S_SUCCESS,
    SCARD_SCOPE_USER,
    SCARD_SHARE_DIRECT,
    SCardConnect,
    SCardControl,
    SCardDisconnect,
    SCardEstablishContext,
    SCardGetErrorMessage,
    SCardListReaders,
    SCardReleaseContext,
)

# CM_IOCTL_GET_FEATURE_REQUEST
FEATURE_REQUEST = SCARD_CTL_CODE(3400)
FEATURE_CCID_ESC_COMMAND = 0x13

# --- Target configuration --------------------------------------------------
# Host Interface: 00 = only HID keyboard, 01 = only CCID (factory default),
#                 02 = HID keyboard + CCID reader.
# Mode 02 keeps the reader reconfigurable over USB (e.g. to flip byte order
# later) while already typing scans. Verified working on iPad and iPhone.
HOST_INTERFACE = 0x02
# Output Format 0x30: upper nibble 0011 = uppercase + 4/7/8/10-byte UIDs,
#                     lower nibble 0000 = hex. Output Order 00 = normal
#                     (UID byte 0 first). Use 01 to reverse all card types.
OUTPUT_FORMAT = [0x30, 0x00]
# UID characters (command data order: Between, End, Start).
# FF = none, 0x28 = HID usage "Keyboard Return (Enter)".
UID_CHARS = [0xFF, 0x28, 0xFF]
# ----------------------------------------------------------------------------


def hexstr(data):
    return " ".join(f"{b:02X}" for b in data)


def check(hresult, what):
    if hresult != SCARD_S_SUCCESS:
        sys.exit(f"ERROR in {what}: {SCardGetErrorMessage(hresult)}")


def escape_control_code(hcard):
    """Ask the driver which control code carries CCID escape commands."""
    hresult, resp = SCardControl(hcard, FEATURE_REQUEST, [])
    check(hresult, "feature request (3400)")
    i = 0
    while i + 1 < len(resp):
        tag, length = resp[i], resp[i + 1]
        if tag == FEATURE_CCID_ESC_COMMAND and length == 4:
            value = resp[i + 2 : i + 6]
            return (value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3]
        i += 2 + length
    sys.exit(
        "Driver does not report FEATURE_CCID_ESC_COMMAND. Is the Apple CCID "
        "driver still active, or is ifdDriverOptions not set to 0x0001? "
        "See docs/wedge-reader-setup.md."
    )


def escape(hcard, code, apdu, what):
    hresult, resp = SCardControl(hcard, code, apdu)
    check(hresult, what)
    if not resp or resp[0] != 0xE1:
        sys.exit(f"ERROR in {what}: unexpected response {hexstr(resp)}")
    print(f"  {what}: {hexstr(resp)}")
    return resp


def main():
    hresult, hcontext = SCardEstablishContext(SCARD_SCOPE_USER)
    check(hresult, "SCardEstablishContext")

    hresult, readers = SCardListReaders(hcontext, [])
    check(hresult, "SCardListReaders")
    picc = [r for r in readers if "ACR1552" in r and "SAM" not in r]
    if not picc:
        sys.exit(f"No ACR1552 PICC reader found. Readers: {readers}")
    name = picc[0]
    print(f"Reader: {name}")

    hresult, hcard, _ = SCardConnect(
        hcontext, name, SCARD_SHARE_DIRECT, SCARD_PROTOCOL_RAW
    )
    check(hresult, "SCardConnect (direct)")

    code = escape_control_code(hcard)
    print(f"Escape control code: 0x{code:08X}")

    print("\nFirmware:")
    fw = escape(hcard, code, [0xE0, 0x00, 0x00, 0x18, 0x00], "Get Firmware Version")
    print("  ->", bytes(fw[5:]).decode("ascii", "replace"))

    print("\nCurrent settings:")
    escape(hcard, code, [0xE0, 0x00, 0x00, 0x93, 0x00], "Get Host Interface")
    escape(hcard, code, [0xE0, 0x00, 0x00, 0x90, 0x00], "Get Output Format")
    escape(hcard, code, [0xE0, 0x00, 0x00, 0x91, 0x00], "Get UID Characters")

    if "--dry-run" in sys.argv:
        print("\n--dry-run: nothing written.")
    else:
        print("\nWriting configuration:")
        escape(
            hcard, code, [0xE0, 0x00, 0x00, 0x90, 0x02] + OUTPUT_FORMAT,
            "Set Output Format (hex, 4/7/8/10-byte UIDs, normal order)",
        )
        escape(
            hcard, code, [0xE0, 0x00, 0x00, 0x91, 0x03] + UID_CHARS,
            "Set UID Characters (no separator, Enter suffix)",
        )
        escape(
            hcard, code, [0xE0, 0x00, 0x00, 0x93, 0x01, HOST_INTERFACE],
            "Set Host Interface (HID keyboard + CCID)",
        )
        print(
            "\nDone. Unplug and replug the reader, then test in a text editor:"
            "\nplace a tag on the reader -> it should type the UID plus Enter."
        )

    SCardDisconnect(hcard, SCARD_LEAVE_CARD)
    SCardReleaseContext(hcontext)


if __name__ == "__main__":
    main()
