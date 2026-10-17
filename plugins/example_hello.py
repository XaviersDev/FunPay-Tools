# Example plugin for FunPay Cardinal / FP Tools.
# NAME: Auto Greeting Demo
# VERSION: 1.0.0
#
# This is a normal FunPay Cardinal plugin: it is a plain .py file with metadata
# fields (NAME / VERSION / DESCRIPTION / CREDITS / UUID / SETTINGS_PAGE) and one
# or more BIND_TO_* handler lists. The FP Tools plugin engine loads it unchanged.
#
# To install: FP Tools menu -> Плагины -> Добавить плагин -> select this file.

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cardinal import Cardinal

logger = logging.getLogger("FPT_Plugins")
_ = lambda s, *a, **k: s

NAME = "Auto Greeting Demo"
VERSION = "1.0.0"
DESCRIPTION = "Демо-плагин: логирует новые сообщения и заказы через движок FP Tools."
CREDITS = "FP Tools"
UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
SETTINGS_PAGE = False

# Words that trigger a reply (demo only - the real FP Tools autoresponder is
# configured in the extension UI, this just shows the handler API).
TRIGGERS = ("привет", "hello", "hi")


def on_new_message(cardinal: Cardinal, event):
    """Called for every new inbound chat message."""
    try:
        text = (event.message.text or "").lower()
        chat_id = event.message.chat_id
        logger.info("Новое сообщение в чате %s: %s", chat_id, event.message.text)
        if any(t in text for t in TRIGGERS):
            cardinal.send_message(chat_id, "Здравствуйте! Сейчас отвечу.")
    except Exception:
        logger.debug("on_new_message failed", exc_info=True)


def on_new_order(cardinal: Cardinal, event):
    """Called when an order is purchased."""
    logger.info("Новый заказ #%s от %s", getattr(event.order, "id", "?"),
                getattr(event.order, "buyer_username", "?"))


def on_post_lots_raise(cardinal: Cardinal, category=None, error=None):
    logger.info("Лоты подняты. Категория: %s, ошибка: %s", category, error)


BIND_TO_NEW_MESSAGE = [on_new_message]
BIND_TO_NEW_ORDER = [on_new_order]
BIND_TO_POST_LOTS_RAISE = [on_post_lots_raise]
