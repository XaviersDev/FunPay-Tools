# plugins_runtime/cardinal_compat.py
# -----------------------------------------------------------------------------
# FunPay Cardinal - compatibility layer for FP Tools.
#
# This module is executed inside the Python (Pyodide) runtime that lives in the
# extension's offscreen document. It registers a *shim* of the FunPay Cardinal
# public API (Cardinal, FunPayAPI, Utils, telebot, locales) into sys.modules so
# that unmodified Cardinal plugins can be imported and executed.
#
# The shim is intentionally permissive: unknown attributes on the shimmed
# modules resolve to dynamically generated classes/objects (PEP 562 __getattr__
# fallbacks) so a plugin importing an API we did not model yet will still load
# instead of crashing at import time.
#
# Networking is performed through the JS bridge function `fptSyncFetch`
# (synchronous XHR in the offscreen document, so the user's FunPay cookies are
# sent). Storage/logging/notifications go through `fptSyncStorageGet` /
# `fptSyncStorageSet` / `fptPluginLog` / `fptNotify` / `fptTelegramSend`.
# -----------------------------------------------------------------------------

import sys
import types
import json
import enum
import uuid as _uuid_lib
import datetime
import logging
import importlib.abc
import importlib.machinery

# verbosity for the shim itself
logger = logging.getLogger("FunPayCardinal")

_ = lambda s, *a, **k: s


# ─────────────────────────────────────────────────────────────────────────────
# JS bridge access
# ─────────────────────────────────────────────────────────────────────────────

def _js(name):
    import js  # noqa: F401  (pyodide injected global)
    return getattr(js, name)


def _fetch(method, url, headers=None, data=None, timeout=30):
    """Synchronous HTTP via the offscreen bridge. Returns (status, text)."""
    try:
        opts = {"method": (method or "GET").upper(), "headers": headers or {}}
        if data is not None:
            opts["body"] = data if isinstance(data, str) else json.dumps(data)
        if timeout:
            opts["timeout"] = int(timeout * 1000)
        raw = _js("fptSyncFetch")(url, json.dumps(opts))
        res = json.loads(raw) if isinstance(raw, str) else raw
        return int(res.get("status", 0)), res.get("text", "")
    except Exception as e:  # pragma: no cover - runtime dependent
        logger.debug("fetch failed: %s %s -> %s", method, url, e)
        return 0, ""


def _storage_get(key, default=None):
    try:
        raw = _js("fptSyncStorageGet")(key)
        if raw is None or raw == "null":
            return default
        return json.loads(raw)
    except Exception:
        return default


def _storage_set(key, value):
    try:
        _js("fptSyncStorageSet")(key, json.dumps(value))
    except Exception:
        pass


def _log(uuid, level, msg):
    try:
        _js("fptPluginLog")(uuid or "", level or "INFO", str(msg))
    except Exception:
        pass


def _notify(title, body):
    try:
        _js("fptNotify")(str(title), str(body))
    except Exception:
        pass


def _telegram_send(text):
    try:
        _js("fptTelegramSend")(str(text))
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Permissive dummy objects
# ─────────────────────────────────────────────────────────────────────────────

class _Dummy:
    """An object that accepts any attribute access / call / item access."""

    def __init__(self, *a, **k):
        self.__dict__.update(k)

    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        child = _Dummy()
        object.__setattr__(self, name, child)
        return child

    def __setattr__(self, name, value):
        object.__setattr__(self, name, value)

    def __getitem__(self, item):
        return _Dummy()

    def __setitem__(self, item, value):
        pass

    def __call__(self, *a, **k):
        return _Dummy()

    def __iter__(self):
        return iter(())

    def __bool__(self):
        return True

    def __repr__(self):
        return "<FPT-shim dummy>"


class _DummyMeta(type):
    """Metaclass letting a dummy *class* answer arbitrary attribute access."""

    def __getattr__(cls, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        child = _dummy_class(name)
        setattr(cls, name, child)
        return child


def _dummy_class(name):
    return _DummyMeta(name, (_Dummy,), {})


class _Localizer:
    def translate(self, key, *a, **k):
        return key


class _LazyModule(types.ModuleType):
    """Module whose missing attributes are auto-created dummies (PEP 562)."""

    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        obj = _dummy_class(name)
        setattr(self, name, obj)
        return obj


def _module(name, parent=None):
    m = _LazyModule(name)
    m.__path__ = []  # mark as package so submodule imports work
    sys.modules[name] = m
    if parent is not None:
        setattr(parent, name.split(".")[-1], m)
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Import hook: auto-create permissive modules for anything we did not model and
# that no real package provides (e.g. `FunPayAPI.updater`, `tg_bot`, `numpy`).
# ─────────────────────────────────────────────────────────────────────────────

class _FptModuleLoader(importlib.abc.Loader):
    def create_module(self, spec):
        return _LazyModule(spec.name)

    def exec_module(self, module):
        if not hasattr(module, "__path__"):
            module.__path__ = []  # treat as a package
        parent_name, _, child = module.__name__.rpartition(".")
        if parent_name:
            parent = sys.modules.get(parent_name)
            if parent is not None:
                try:
                    setattr(parent, child, module)
                except Exception:
                    pass


# Roots we are willing to stub when nothing real provides them. This is a
# deliberately EXPLICIT allowlist (not a wildcard): stubbing arbitrary modules
# would break stdlib code that probes platform modules with try/except (e.g.
# subprocess does `try: import msvcrt` to detect Windows).
_FPT_STUB_ROOTS = frozenset((
    # Cardinal / FunPay ecosystem
    "FunPayAPI", "Utils", "locales", "cardinal", "tg_bot", "telebot", "telegram",
    # common plugin dependencies
    "requests", "requests_toolbelt", "urllib3", "fake_useragent", "json5", "bs4",
    "lxml", "pycountry", "aiohttp", "colorama", "dotenv", "user_agent", "dotenv",
    "PIL", "cv2", "numpy", "pandas", "scipy", "sklearn", "matplotlib", "seaborn",
    "apscheduler", "dateutil", "pytz", "zoneinfo", "openpyxl", "xlsxwriter",
    "docx", "qrcode", "yt_dlp", "pytube", "emoji", "tqdm", "redis", "psutil",
    "yaml", "toml", "html5lib", "coloredlogs", "loguru", "rich", "aiogram",
    "pyrogram", "telethon", "sqlalchemy", "jinja2", "pydantic", "cachetools",
    "tenacity", "retrying", "schedule", "Crypto", "cryptography", "bcrypt",
    "google", "vk_api", "vkbottle", "dill", "cloudpickle", "watchdog", "paramiko",
    "mysql", "pymysql", "psycopg2", "pymongo", "openai", "socks", "httpx",
    "regex", "Levenshtein", "rapidfuzz", "keyring", "pyperclip", "tabulate",
    "prettytable", "colorlog", "ratelimit", "telegramify_markdown", "steam",
    "numpy_financial", "gspread", "oauth2client", "firebase_admin", "pymsgbox",
    "pyautogui", "mss", "pygetwindow", "pyrect",
))


class _FptModuleFinder(importlib.abc.MetaPathFinder):
    """Last-resort finder for the allowlisted roots above: if a module is
    genuinely not installed, hand back a permissive stub instead of raising
    ModuleNotFoundError. Standard/pyodide finders run first, so real packages
    always win."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname in sys.modules:
            return None
        root = fullname.split(".", 1)[0]
        if root not in _FPT_STUB_ROOTS:
            return None
        return importlib.machinery.ModuleSpec(fullname, _FptModuleLoader(), is_package=True)


sys.meta_path[:] = [f for f in sys.meta_path if type(f).__name__ != "_FptModuleFinder"]
sys.meta_path.append(_FptModuleFinder())


# ─────────────────────────────────────────────────────────────────────────────
# FunPayAPI.common.enums
# ─────────────────────────────────────────────────────────────────────────────

class EventTypes(enum.Enum):
    INITIAL_CHAT = "INITIAL_CHAT"
    CHATS_LIST_CHANGED = "CHATS_LIST_CHANGED"
    LAST_CHAT_MESSAGE_CHANGED = "LAST_CHAT_MESSAGE_CHANGED"
    NEW_MESSAGE = "NEW_MESSAGE"
    INITIAL_ORDER = "INITIAL_ORDER"
    ORDERS_LIST_CHANGED = "ORDERS_LIST_CHANGED"
    NEW_ORDER = "NEW_ORDER"
    ORDER_STATUS_CHANGED = "ORDER_STATUS_CHANGED"


class MessageTypes(enum.Enum):
    NON_SYSTEM = "NON_SYSTEM"
    ORDER_PURCHASED = "ORDER_PURCHASED"
    ORDER_CONFIRMED = "ORDER_CONFIRMED"
    NEW_FEEDBACK = "NEW_FEEDBACK"
    FEEDBACK_CHANGED = "FEEDBACK_CHANGED"
    DEAR_VENDORS = "DEAR_VENDORS"
    BAD_FEEDBACK = "BAD_FEEDBACK"
    PARTIAL_REFUND = "PARTIAL_REFUND"


class OrderStatuses(enum.Enum):
    PAID = "paid"
    CLOSED = "closed"
    REFUNDED = "refunded"
    PARTIAL = "partial"


class SubCategoriesTypes(enum.Enum):
    COMMON = "common"
    NON_AUTO = "non-auto"
    AUTO = "auto"
    CHIPS = "chips"


class Currency(enum.Enum):
    RUB = "RUB"
    USD = "USD"
    EUR = "EUR"
    UAH = "UAH"
    KZT = "KZT"
    BYN = "BYN"


# ─────────────────────────────────────────────────────────────────────────────
# FunPayAPI.types - light-weight data carriers mapped from our events
# ─────────────────────────────────────────────────────────────────────────────

class _Model:
    _fields = ()

    def __init__(self, **kwargs):
        for f in self._fields:
            setattr(self, f, kwargs.get(f))
        for k, v in kwargs.items():
            if not hasattr(self, k):
                setattr(self, k, v)

    def __repr__(self):
        data = {f: getattr(self, f, None) for f in self._fields}
        return f"{type(self).__name__}({data})"

    __getattr__ = _Dummy.__getattr__


class Message(_Model):
    _fields = ("chat_id", "chat_name", "text", "id", "author_id", "author",
               "by_bot", "by_vertex", "type", "is_autoreply", "image_link",
               "node_msg", "user_msg", "html")


class Order(_Model):
    _fields = ("id", "status", "title", "price", "currency", "amount",
               "buyer_id", "buyer_username", "seller_id", "seller_username",
               "lots", "order_id", "short_link", "buyer", "seller")


class Lot(_Model):
    _fields = ("id", "offer_id", "title", "description", "price", "currency",
               "amount", "auto_delivery", "fields", "node_id", "game_id",
               "subcategory_name", "category", "secrets")


class ChatShortcut(_Model):
    _fields = ("id", "name", "last_message", "unread", "type")


class UserPreview(_Model):
    _fields = ("id", "username", "registration_date", "rating", "reviews_count",
               "lots", "avatar", "status")


class Seller(UserPreview):
    _fields = UserPreview._fields + ("sales", "is_online", "last_seen")


class Category(_Model):
    _fields = ("id", "name", "game_id", "node_id", "position", "lots",
               "subcategories", "auto_delivery")


class SubCategory(Category):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# FunPayAPI.exceptions / FunPayAPI.common.exceptions
# ─────────────────────────────────────────────────────────────────────────────

class FunPayAPIException(Exception):
    pass


class AccountNotInitiatedError(FunPayAPIException):
    pass


class RequestFailedError(FunPayAPIException):
    pass


class UnauthorizedError(FunPayAPIException):
    pass


class TooManyRequestsError(FunPayAPIException):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# FunPayAPI.account.Account - best-effort implementation over the bridge
# ─────────────────────────────────────────────────────────────────────────────

class Account:
    """Minimal FunPayAPI account compatible with common plugin usage."""

    def __init__(self, golden_key=None, user_agent=None, proxy=None, *a, **k):
        self.golden_key = golden_key
        self.user_agent = user_agent
        self.proxy = proxy
        self.id = None
        self.username = None
        self.currency = None
        self._csrf = None
        self._last_tag = {}
        self._init_home()

    # --- internals -----------------------------------------------------------
    def _init_home(self):
        status, html = _fetch("GET", "https://funpay.com/")
        if not html:
            return
        import re
        m = re.search(r'"userId":(\d+)', html)
        if m:
            self.id = int(m.group(1))
        m = re.search(r'name="csrf-token"\s+content="([^"]+)"', html)
        if m:
            self._csrf = m.group(1)
        m = re.search(r'"username":"([^"]+)"', html)
        if m:
            self.username = m.group(1)

    def _request(self, method, path, data=None, locale=None, headers=None):
        if isinstance(path, str) and path.startswith("http"):
            url = path
        else:
            url = "https://funpay.com/" + str(path).lstrip("/")
        hdrs = {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        }
        if self._csrf:
            hdrs["X-Csrf-Token"] = self._csrf
        if headers:
            hdrs.update(headers)
        body = None
        if data is not None:
            body = data if isinstance(data, str) else "&".join(
                f"{k}={v}" for k, v in dict(data).items())
        return _fetch(method, url, headers=hdrs, data=body)

    @staticmethod
    def _json(text):
        try:
            return json.loads(text)
        except Exception:
            return None

    # --- public API ----------------------------------------------------------
    def get_balance(self, *a, **k):
        status, html = self._request("GET", f"users/{self.id}/" if self.id else "")
        import re
        amounts = re.findall(r'class="badge-balance">\s*([\d\s.,]+)', html)
        try:
            return float(amounts[0].replace(" ", "").replace(",", ".")) if amounts else 0.0
        except Exception:
            return 0.0

    def get_balances(self, *a, **k):
        return self.get_balance()

    def get_user(self, user_id, *a, **k):
        status, html = self._request("GET", f"users/{user_id}/")
        return UserPreview(id=user_id, raw_html=html)

    def get_profile(self, *a, **k):
        return self.get_user(self.id)

    def get_chat_list(self, *a, **k):
        return []

    def get_chats(self, *a, **k):
        return self.get_chat_list()

    def get_chat(self, chat_id, *a, **k):
        return _Dummy()

    def get_chat_history(self, chat_id, *a, **k):
        return []

    def get_order(self, order_id, *a, **k):
        return Order(id=order_id, order_id=order_id)

    def get_order_shortcuts(self, *a, **k):
        return []

    def send_message(self, chat_id, text, node_msg=None, image_id=None, *a, **k):
        payload = {
            "objects": json.dumps([{
                "type": "chat_node", "id": chat_id, "tag": "00000000",
                "data": {"node": chat_id, "last_message": -1, "content": ""}
            }]),
            "request": json.dumps({"action": "chat_message", "data": {
                "node": chat_id, "last_message": node_msg or -1,
                "content": text, "image_id": image_id,
            }}),
            "csrf_token": self._csrf or "",
        }
        status, txt = self._request("POST", "runner/", data=payload)
        res = self._json(txt) or {}
        if res.get("error"):
            raise RequestFailedError(res["error"])
        return _Dummy(id=None)

    def raise_lots(self, game_id=None, node_id=None, node_ids=None, *a, **k):
        data = {"game_id": game_id, "node_id": node_id}
        if node_ids:
            data["node_ids[]"] = ",".join(str(x) for x in node_ids)
        status, txt = self._request("POST", "lots/raise", data=data)
        return bool(status and status < 400)

    def deliver_order(self, order_id, *a, **k):
        status, txt = self._request("POST", "orders/trade", data={"id": order_id})
        return status == 200

    def get_lot_fields(self, offer_id, *a, **k):
        return _Dummy(offer_id=offer_id)

    def save_lot(self, *a, **k):
        return True

    def get_raise_categories(self, *a, **k):
        return []

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


class Runner:
    def __init__(self, account, *a, **k):
        self.account = account

    def listen(self, requests_delay=10, *a, **k):
        return iter(())

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


# ─────────────────────────────────────────────────────────────────────────────
# FunPayAPI.events
# ─────────────────────────────────────────────────────────────────────────────

class Event:
    def __init__(self, type=None, **data):
        self.type = type
        self.__dict__.update(data)

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


def _build_real_message(payload):
    import FunPayAPI.types as _t
    import FunPayAPI.common.enums as _en
    import FunPayAPI.updater.events as _ev
    msg = _t.Message(
        id_=int(payload.get("messageId") or 0),
        text=payload.get("messageText"),
        chat_id=payload.get("chatId"),
        chat_name=payload.get("chatName") or payload.get("buyerName"),
        interlocutor_id=None,
        author=payload.get("buyerName"),
        author_id=int(payload.get("authorId") or 0),
        html="",
        determine_msg_type=False,
    )
    mt = payload.get("msgType")
    msg.type = _en.MessageTypes.__members__.get(mt, _en.MessageTypes.NON_SYSTEM)
    return _ev.NewMessageEvent(runner_tag="FPT", message_obj=msg)


def _build_real_order_shortcut(payload, status):
    import FunPayAPI.types as _t
    import FunPayAPI.common.enums as _en
    import datetime as _dt
    return _t.OrderShortcut(
        id_=str(payload.get("orderId") or ""),
        description=payload.get("title") or payload.get("description") or "",
        price=float(payload.get("price") or 0.0),
        currency=_en.Currency.RUB,
        buyer_username=payload.get("buyerName") or "",
        buyer_id=int(payload.get("buyerId") or 0),
        chat_id=payload.get("chatId") or 0,
        status=status,
        date=_dt.datetime.now(),
        subcategory_name="",
        subcategory=None,
        html="",
        dont_search_amount=True,
    )


def _make_event(kind, payload):
    # Prefer the REAL FunPayAPI event/type classes when the vendored sources are
    # active, so plugins get genuine Message/OrderShortcut/NewMessageEvent etc.
    try:
        if kind == "new_message":
            return _build_real_message(payload)
        if kind == "new_order":
            import FunPayAPI.common.enums as _en
            import FunPayAPI.updater.events as _ev
            return _ev.NewOrderEvent(
                runner_tag="FPT",
                order_obj=_build_real_order_shortcut(payload, _en.OrderStatuses.PAID))
        if kind == "order_status_changed":
            import FunPayAPI.common.enums as _en
            import FunPayAPI.updater.events as _ev
            st = payload.get("status")
            status = _en.OrderStatuses.CLOSED if st in (None, "closed", "CLOSED") else _en.OrderStatuses.PAID
            return _ev.OrderStatusChangedEvent(
                runner_tag="FPT",
                order_obj=_build_real_order_shortcut(payload, status))
    except Exception:
        pass  # fall back to the lightweight shim models below

    et = getattr(EventTypes, kind, None)
    if kind == "new_message":
        msg = Message(
            chat_id=payload.get("chatId"),
            _chat_id=payload.get("chatId"),
            id=payload.get("messageId"),
            text=payload.get("messageText"),
            author=payload.get("buyerName"),
            chat_name=payload.get("chatName") or payload.get("buyerName"),
            type=payload.get("msgType"),
        )
        return Event(type=EventTypes.NEW_MESSAGE, message=msg, **payload)
    if kind == "new_order":
        order = Order(
            id=payload.get("orderId"), order_id=payload.get("orderId"),
            buyer_username=payload.get("buyerName"),
            title=payload.get("title"), status="paid",
        )
        return Event(type=EventTypes.NEW_ORDER, order=order, **payload)
    if kind == "order_status_changed":
        order = Order(id=payload.get("orderId"), order_id=payload.get("orderId"),
                      status=payload.get("status"))
        return Event(type=EventTypes.ORDER_STATUS_CHANGED, order=order, **payload)
    return Event(type=et, **payload)


# ─────────────────────────────────────────────────────────────────────────────
# Utils package
# ─────────────────────────────────────────────────────────────────────────────

class FieldNotExistsError(Exception):
    def __init__(self, field=None, file=None):
        super().__init__(f"Field {field} not found in {file}")


class ConfigLoaderError(Exception):
    pass


class ConfigReader:
    def __init__(self, cfg=None):
        self._data = {}
        self._cfg = cfg

    def load(self, *a, **k):
        self._data = _storage_get("fpToolsPluginConfigs") or {}
        if self._cfg:
            self._data = self._data.get(self._cfg, {})
        return self

    def __getitem__(self, section):
        sec = self._data.get(section)
        return sec if isinstance(sec, dict) else {}

    def __setitem__(self, section, value):
        self._data[section] = value

    def get(self, section, option=None, *a, **k):
        sec = self._data.get(section, {})
        if option is None:
            return sec
        return sec.get(option)

    def set(self, section, option, value, *a, **k):
        self._data.setdefault(section, {})[option] = value

    def save(self, *a, **k):
        _storage_set("fpToolsPluginConfigs", {self._cfg: self._data} if self._cfg else self._data)

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


class LogLevel(enum.Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


# ─────────────────────────────────────────────────────────────────────────────
# telebot shim
# ─────────────────────────────────────────────────────────────────────────────

class _TeleBot:
    def __init__(self, token=None, *a, **k):
        self.token = token

    def send_message(self, chat_id, text, *a, **k):
        _telegram_send(text)
        return _Dummy(message_id=None, chat=_Dummy(id=chat_id), text=text)

    def edit_message_text(self, text, chat_id=None, message_id=None, *a, **k):
        return _Dummy()

    def reply_to(self, message, text, *a, **k):
        return self.send_message(getattr(message, "chat", _Dummy()), text)

    def answer_callback_query(self, *a, **k):
        return None

    def polling(self, *a, **k):
        return None

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


class _InlineKeyboardButton:
    def __init__(self, text=None, callback_data=None, url=None, **k):
        self.text = text
        self.callback_data = callback_data
        self.url = url
        self.__dict__.update(k)


class _InlineKeyboardMarkup:
    def __init__(self, *a, **k):
        self.keyboard = []

    def add(self, *buttons):
        self.keyboard.append(list(buttons))
        return self

    def row(self, *buttons):
        return self.add(*buttons)

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


# ─────────────────────────────────────────────────────────────────────────────
# Register all modules in sys.modules
# ─────────────────────────────────────────────────────────────────────────────

def _install_modules():
    # FunPayAPI
    fp = _module("FunPayAPI")
    fp.Account = Account
    fp.Runner = Runner
    fp.EventTypes = EventTypes
    fp.enums = sys.modules["FunPayAPI.common.enums"] if "FunPayAPI.common.enums" in sys.modules else None
    fp.types = None
    fp.events = None
    fp.exceptions = None
    fp.common = None
    fp.utils = None

    common = _module("FunPayAPI.common", fp)
    enums_m = _module("FunPayAPI.common.enums", common)
    enums_m.EventTypes = EventTypes
    enums_m.MessageTypes = MessageTypes
    enums_m.OrderStatuses = OrderStatuses
    enums_m.SubCategoriesTypes = SubCategoriesTypes
    enums_m.Currency = Currency
    common.enums = enums_m

    cexc = _module("FunPayAPI.common.exceptions", common)
    for cls in (FunPayAPIException, AccountNotInitiatedError, RequestFailedError,
                UnauthorizedError, TooManyRequestsError):
        setattr(cexc, cls.__name__, cls)
    common.exceptions = cexc

    utils = _module("FunPayAPI.common.utils", common)
    utils.random_tag = lambda: _uuid_lib.uuid4().hex[:8]
    common.utils = utils

    types_m = _module("FunPayAPI.types", fp)
    for cls in (Message, Order, Lot, ChatShortcut, UserPreview, Seller,
                Category, SubCategory):
        setattr(types_m, cls.__name__, cls)
    fp.types = types_m

    events_m = _module("FunPayAPI.events", fp)
    events_m.Event = Event
    fp.events = events_m

    exc_m = _module("FunPayAPI.exceptions", fp)
    for cls in (FunPayAPIException, AccountNotInitiatedError, RequestFailedError,
                UnauthorizedError, TooManyRequestsError):
        setattr(exc_m, cls.__name__, cls)
    fp.exceptions = exc_m

    # FunPayAPI.Account / FunPayAPI.Runner as attributes too
    fp.Account = Account
    fp.Runner = Runner

    # Utils
    ut = _module("Utils")
    cl = _module("Utils.config_loader", ut)
    cl.ConfigReader = ConfigReader
    cl.ConfigLoader = ConfigReader
    cl.cfg = ConfigReader()
    cl.load_config = lambda *a, **k: ConfigReader()
    ut.config_loader = cl

    uexc = _module("Utils.exceptions", ut)
    for cls in (FieldNotExistsError, ConfigLoaderError):
        setattr(uexc, cls.__name__, cls)
    ut.exceptions = uexc

    ulog = _module("Utils.logger", ut)
    ulog.LogLevel = LogLevel

    def _mk_logger(name="Plugin"):
        lg = logging.getLogger(name)
        return lg

    ulog.get_logger = _mk_logger
    ulog.logger = _mk_logger("Plugin")
    ut.logger = ulog

    ct = _module("Utils.cardinal_tools", ut)
    ct.load_disabled_plugins = lambda: _storage_get("fpToolsPluginDisabled", [])
    ct.load_pinned_plugins = lambda: _storage_get("fpToolsPluginPinned", [])
    ut.cardinal_tools = ct

    # requests (functional, backed by the synchronous fetch bridge)
    req = _module("requests")

    class _Response:
        def __init__(self, status, text):
            self.status_code = status
            self.text = text or ""
            self.content = (text or "").encode("utf-8", "ignore")
            self.ok = 200 <= status < 300
            self.headers = {}
            self.cookies = _Dummy()
            self.url = ""
            self.encoding = "utf-8"
            self.reason = ""
            self.history = []

        def json(self):
            return json.loads(self.text)

        def raise_for_status(self):
            if not self.ok:
                raise RequestFailedError(f"HTTP {self.status_code}")

        def __repr__(self):
            return f"<Response [{self.status_code}]>"

    class _Session:
        def __init__(self):
            self.headers = {}
            self.cookies = _Dummy()

        def request(self, method, url, headers=None, data=None, json=None, params=None,
                    timeout=None, verify=None, allow_redirects=True, **kw):
            hdrs = dict(self.headers or {})
            if headers:
                hdrs.update(headers)
            body = data
            if json is not None:
                body = __import__("json").dumps(json)
                hdrs.setdefault("Content-Type", "application/json")
            if params:
                from urllib.parse import urlencode
                sep = "&" if "?" in url else "?"
                url = url + sep + urlencode(params)
            status, text = _fetch(method, url, headers=hdrs, data=body, timeout=timeout or 30)
            return _Response(status, text)

        def get(self, url, **kw): return self.request("GET", url, **kw)
        def post(self, url, **kw): return self.request("POST", url, **kw)
        def put(self, url, **kw): return self.request("PUT", url, **kw)
        def patch(self, url, **kw): return self.request("PATCH", url, **kw)
        def delete(self, url, **kw): return self.request("DELETE", url, **kw)
        def head(self, url, **kw): return self.request("HEAD", url, **kw)
        def options(self, url, **kw): return self.request("OPTIONS", url, **kw)
        def mount(self, *a, **k): pass
        def close(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass

    req.Response = _Response
    req.Session = _Session
    req.session = lambda: _Session()
    req.request = lambda method, url, **kw: _Session().request(method, url, **kw)
    req.get = lambda url, **kw: _Session().get(url, **kw)
    req.post = lambda url, **kw: _Session().post(url, **kw)
    req.put = lambda url, **kw: _Session().put(url, **kw)
    req.delete = lambda url, **kw: _Session().delete(url, **kw)
    req.exceptions = _module("requests.exceptions", req)
    # identity bits some libraries read at import time
    req.__version__ = "2.28.1"
    req.__build__ = 0x022801
    req.packages = req

    # requests_toolbelt (image upload helper used by FunPayAPI)
    rtb = _module("requests_toolbelt")
    rtb.MultipartEncoder = _dummy_class("MultipartEncoder")
    rtb.MultipartDecoder = _dummy_class("MultipartDecoder")
    rtb.adapters = _module("requests_toolbelt.adapters", rtb)
    rtb.adapters.SSLAdapter = _dummy_class("SSLAdapter")

    # fake_useragent
    fua = _module("fake_useragent")

    class _UserAgent:
        def __getattr__(self, name):
            if name.startswith("__"):
                raise AttributeError(name)
            return ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

    fua.UserAgent = _UserAgent
    fua.FakeUserAgent = _UserAgent

    # json5 -> stdlib json (covers the common cases)
    sys.modules.setdefault("json5", json)

    # telebot
    tb = _module("telebot")
    tb.TeleBot = _TeleBot
    tbt = _module("telebot.types", tb)
    tbt.Message = _dummy_class("Message")
    tbt.CallbackQuery = _dummy_class("CallbackQuery")
    tbt.InlineKeyboardMarkup = _InlineKeyboardMarkup
    tbt.InlineKeyboardButton = _InlineKeyboardButton
    tbt.ReplyKeyboardMarkup = _InlineKeyboardMarkup
    tbt.ReplyKeyboardRemove = _InlineKeyboardMarkup
    tbt.InlineKeyboardMarkup = _InlineKeyboardMarkup
    tbt.Chat = _dummy_class("Chat")
    tbt.User = _dummy_class("User")
    tb.types = tbt
    tb.telebot = tb
    # some plugins import the PyPI package name instead of the telebot name
    sys.modules.setdefault("telegram", tb)
    sys.modules.setdefault("telegram.types", tbt)

    # locales
    loc = _module("locales")
    lz = _module("locales.localizer", loc)
    lz.Localizer = _Localizer
    loc.localizer = lz

    # cardinal module (some plugins import `from cardinal import Cardinal`)
    if "__main__" in sys.modules:
        sys.modules.setdefault("cardinal", sys.modules["__main__"])
    else:
        sys.modules.setdefault("cardinal", _module("cardinal"))


_install_modules()


# ─────────────────────────────────────────────────────────────────────────────
# Plugin registry / handlers
# ─────────────────────────────────────────────────────────────────────────────

BIND_NAMES = {
    "BIND_TO_PRE_INIT": "pre_init",
    "BIND_TO_POST_INIT": "post_init",
    "BIND_TO_PRE_START": "pre_start",
    "BIND_TO_POST_START": "post_start",
    "BIND_TO_PRE_STOP": "pre_stop",
    "BIND_TO_POST_STOP": "post_stop",
    "BIND_TO_INIT_MESSAGE": "init_message",
    "BIND_TO_MESSAGES_LIST_CHANGED": "messages_list_changed",
    "BIND_TO_LAST_CHAT_MESSAGE_CHANGED": "last_chat_message_changed",
    "BIND_TO_NEW_MESSAGE": "new_message",
    "BIND_TO_INIT_ORDER": "init_order",
    "BIND_TO_ORDERS_LIST_CHANGED": "orders_list_changed",
    "BIND_TO_NEW_ORDER": "new_order",
    "BIND_TO_ORDER_STATUS_CHANGED": "order_status_changed",
    "BIND_TO_PRE_DELIVERY": "pre_delivery",
    "BIND_TO_POST_DELIVERY": "post_delivery",
    "BIND_TO_PRE_LOTS_RAISE": "pre_lots_raise",
    "BIND_TO_POST_LOTS_RAISE": "post_lots_raise",
}

_plugins = {}          # uuid -> module
_handlers = {v: [] for v in BIND_NAMES.values()}  # event -> [(uuid, func)]
_delete_handlers = {}   # uuid -> func


class Cardinal:
    """The object passed as the first argument to every plugin handler."""

    def __init__(self):
        self.account = Account()
        self.runner = Runner(self.account)
        self.telegram = _Dummy()
        self.telegram.bot = _TeleBot()
        self.plugins = {}
        self.MAIN_CFG = ConfigReader(cfg="main")
        self.PREFIX = ""
        self.locale = _Localizer()
        self.VERSION = "FPTOOLS"

    def send_message(self, chat_id, text, *a, **k):
        return self.account.send_message(chat_id, text, *a, **k)

    def get_balance(self, *a, **k):
        return self.account.get_balance()

    def deliver_order(self, *a, **k):
        return self.account.deliver_order(*a, **k)

    def raise_lots(self, *a, **k):
        return self.account.raise_lots(*a, **k)

    def log(self, level, msg):
        _log(None, level, msg)

    def __getattr__(self, name):
        return _Dummy.__getattr__(self, name)


_cardinal = Cardinal()


# ─────────────────────────────────────────────────────────────────────────────
# Loader / dispatcher entry points (called from JS via pyodide)
# ─────────────────────────────────────────────────────────────────────────────

def _fpt_load_plugin(uuid, name, source):
    """Exec a plugin source, register its handlers, return metadata as JSON."""
    meta = {"uuid": uuid, "name": name, "version": "", "description": "",
            "credits": "", "settingsPage": False, "commands": []}
    try:
        mod_name = f"fpt_plugins.{uuid.replace('-', '_')}"
        mod = types.ModuleType(mod_name)
        mod.__dict__["__fpt_cardinal__"] = _cardinal
        sys.modules[mod_name] = mod
        code = compile(source, f"<plugin:{name}>", "exec")
        exec(code, mod.__dict__)

        meta["name"] = getattr(mod, "NAME", name)
        meta["version"] = str(getattr(mod, "VERSION", ""))
        meta["description"] = getattr(mod, "DESCRIPTION", "")
        meta["credits"] = getattr(mod, "CREDITS", "")
        meta["settingsPage"] = bool(getattr(mod, "SETTINGS_PAGE", False))

        if hasattr(mod, "UUID") and mod.UUID:
            meta["uuid"] = str(mod.UUID)

        for bind, event in BIND_NAMES.items():
            funcs = getattr(mod, bind, None)
            if not funcs:
                continue
            if not isinstance(funcs, (list, tuple)):
                funcs = [funcs]
            for f in funcs:
                _handlers[event].append((uuid, f))

        dh = getattr(mod, "BIND_TO_DELETE", None)
        if dh:
            _delete_handlers[uuid] = dh

        _plugins[uuid] = mod
        _log(uuid, "INFO", f"Плагин '{meta['name']}' v{meta['version']} загружен.")
        return json.dumps({"ok": True, "meta": meta})
    except Exception as e:
        import traceback
        _log(uuid, "ERROR", f"Ошибка загрузки плагина '{name}': {e}\n{traceback.format_exc()}")
        return json.dumps({"ok": False, "error": str(e)})


def _fpt_parse_plugin(name, source):
    """Exec a plugin in a throwaway module and return ONLY metadata (no handler
    registration, so parsing a disabled/just-added plugin has no side effects)."""
    meta = {"uuid": None, "name": name, "version": "", "description": "",
            "credits": "", "settingsPage": False, "handlers": []}
    try:
        mod_name = f"fpt_parse.{abs(hash(source)) & 0xffffffff}"
        mod = types.ModuleType(mod_name)
        code = compile(source, f"<plugin:{name}>", "exec")
        exec(code, mod.__dict__)
        meta["name"] = getattr(mod, "NAME", name)
        meta["version"] = str(getattr(mod, "VERSION", ""))
        meta["description"] = getattr(mod, "DESCRIPTION", "")
        meta["credits"] = getattr(mod, "CREDITS", "")
        meta["settingsPage"] = bool(getattr(mod, "SETTINGS_PAGE", False))
        meta["uuid"] = str(getattr(mod, "UUID", "")) or None
        meta["handlers"] = [bind for bind in BIND_NAMES if getattr(mod, bind, None)]
        return json.dumps({"ok": True, "meta": meta})
    except Exception as e:
        import traceback
        return json.dumps({"ok": False, "error": str(e),
                           "traceback": traceback.format_exc(), "meta": meta})


def _fpt_unload_plugin(uuid):
    try:
        dh = _delete_handlers.pop(uuid, None)
        if dh:
            try:
                dh(_cardinal, _Dummy())
            except Exception:
                pass
        for event in _handlers:
            _handlers[event] = [(u, f) for (u, f) in _handlers[event] if u != uuid]
        mod = _plugins.pop(uuid, None)
        if mod is not None:
            sys.modules.pop(mod.__name__, None)
        _log(uuid, "INFO", "Плагин выгружен.")
        return json.dumps({"ok": True})
    except Exception as e:
        return json.dumps({"ok": False, "error": str(e)})


async def _fpt_dispatch(event, payload_json):
    payload = json.loads(payload_json) if payload_json else {}
    handlers = list(_handlers.get(event, []))
    if not handlers:
        return json.dumps({"ok": True, "handled": 0})

    _no_arg = {"pre_init", "post_init", "pre_start", "post_start",
               "pre_stop", "post_stop"}
    obj = _make_event(event, payload) if event not in _no_arg else None

    handled = 0
    for uuid, func in handlers:
        try:
            if event in _no_arg:
                res = func(_cardinal)
            elif event in ("pre_lots_raise", "post_lots_raise"):
                res = func(_cardinal, payload.get("category"), payload.get("error"))
            elif event in ("pre_delivery", "post_delivery"):
                res = func(_cardinal, _make_event("order_status_changed", payload).order)
            else:
                res = func(_cardinal, obj)
            if hasattr(res, "__await__"):
                await res
            handled += 1
        except Exception as e:
            import traceback
            _log(uuid, "ERROR",
                 f"[{event}] {type(e).__name__}: {e}\n{traceback.format_exc()}")
    return json.dumps({"ok": True, "handled": handled})


def _fpt_status():
    return json.dumps({
        "loaded": list(_plugins.keys()),
        "handlers": {k: len(v) for k, v in _handlers.items() if v},
    })


def _fpt_plugin_commands(uuid):
    mod = _plugins.get(uuid)
    if not mod:
        return "[]"
    cmds = getattr(mod, "COMMANDS", None) or getattr(mod, "commands", None) or {}
    try:
        return json.dumps(list(cmds.keys()) if hasattr(cmds, "keys") else list(cmds))
    except Exception:
        return "[]"


def _fpt_run_command(uuid, command, args_json):
    mod = _plugins.get(uuid)
    if not mod:
        return json.dumps({"ok": False, "error": "plugin not loaded"})
    args = json.loads(args_json) if args_json else []
    fn = getattr(mod, command, None)
    if not callable(fn):
        return json.dumps({"ok": False, "error": f"command {command} not found"})
    try:
        res = fn(_cardinal, *args)
        if hasattr(res, "__await__"):
            import asyncio
            res = asyncio.ensure_future(res)
        return json.dumps({"ok": True, "result": str(res)[:2000]})
    except Exception as e:
        return json.dumps({"ok": False, "error": str(e)})
