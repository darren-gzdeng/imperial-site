import datetime
from zoneinfo import ZoneInfo


SYDNEY_TZ = ZoneInfo("Australia/Sydney")


def sydney_timestamp():
    return datetime.datetime.now(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")


def utc_iso_timestamp(minutes=0):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).isoformat()


def utc_timestamp_to_sydney(value):
    if not value:
        return sydney_timestamp()

    try:
        cleaned_value = value.replace(" AEST", "").replace(" AEDT", "")
        utc_datetime = datetime.datetime.strptime(cleaned_value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        return utc_datetime.astimezone(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")
    except ValueError:
        return value


def normalize_quantity(value):
    try:
        quantity = float(value)
    except (TypeError, ValueError):
        return None

    if quantity <= 0:
        return None

    return quantity


def calculate_retail_price(unit_price):
    return round(round(float(unit_price) * 1.3 * 10) / 10, 2)


def price_to_cents(value):
    return int(round(float(value) * 100))


def calculate_shipping(subtotal):
    if subtotal >= 85:
        return 0
    if subtotal >= 39:
        return 6.5
    return 15
