"""
WhatsApp Notification Helper for Sanjay Kirana Store
Sends order alert notifications to the Store Owner (9919193538).
Uses Meta WhatsApp Cloud API / REST endpoints when configured, with persistent
outbox tracking, error resilience, and zero blocking of customer checkout.
"""

import os
import re
import json
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger("whatsapp_notifier")

OWNER_WHATSAPP_DEFAULT = "919919193538"


def format_order_whatsapp_message(order_data: dict) -> str:
    """
    Formats the WhatsApp alert message for the store owner.
    """
    order_id = order_data.get("order_id") or order_data.get("orderId") or "N/A"
    customer_name = order_data.get("customer_name") or order_data.get("customerName") or "Customer"
    order_total = order_data.get("total_amount") or order_data.get("total") or "0.00"
    payment_method = str(order_data.get("payment_method") or order_data.get("paymentMethod") or "cod").upper()
    delivery_area = order_data.get("delivery_address") or order_data.get("city") or "Harraiya"
    if len(delivery_area) > 60:
        delivery_area = delivery_area[:57] + "..."

    items = order_data.get("items") or []
    if items:
        item_names = []
        for it in items[:4]:
            name = it.get("name") or it.get("product_name") or it.get("productName") or "Item"
            qty = it.get("quantity") or 1
            item_names.append(f"{name} (x{qty})")
        item_summary = ", ".join(item_names)
        if len(items) > 4:
            item_summary += f" +{len(items) - 4} more"
    else:
        item_summary = f"{order_data.get('total_items', 1)} items"

    msg = (
        f"🛒 *New Order — Sanjay Kirana Store*\n\n"
        f"• *Order ID:* {order_id}\n"
        f"• *Customer:* {customer_name}\n"
        f"• *Items:* {item_summary}\n"
        f"• *Total:* ₹{order_total}\n"
        f"• *Payment:* {payment_method}\n"
        f"• *Delivery Area:* {delivery_area}\n\n"
        f"Please open the owner dashboard to view the complete order and update its status."
    )
    return msg


def record_whatsapp_outbox(cursor, order_id: int, recipient_phone: str, message_text: str) -> int:
    """
    Inserts a message into the whatsapp_outbox table.
    """
    cursor.execute("""
        INSERT INTO whatsapp_outbox (order_id, recipient_phone, message_text, status, attempts)
        VALUES (%s, %s, %s, 'pending', 0)
        RETURNING id;
    """, (order_id, recipient_phone, message_text))
    row = cursor.fetchone()
    return row[0] if row else None


def dispatch_whatsapp_message(outbox_id: int, recipient_phone: str, message_text: str, conn_factory=None) -> dict:
    """
    Attempts to dispatch the WhatsApp message via Meta Cloud API or configured provider.
    Updates the outbox status in the database.
    Does not raise exceptions to the caller.
    """
    enabled = os.getenv("WHATSAPP_ENABLED", "false").lower() in ("true", "1", "yes")
    api_url = os.getenv("WHATSAPP_API_URL", "").strip()
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()

    # Clean destination phone
    clean_phone = re.sub(r"\D", "", recipient_phone)
    if not clean_phone.startswith("91") and len(clean_phone) == 10:
        clean_phone = f"91{clean_phone}"

    if not enabled or not access_token:
        reason = "WhatsApp notifications disabled or WHATSAPP_ACCESS_TOKEN not configured."
        _update_outbox_status(outbox_id, "unconfigured", reason, conn_factory)
        return {"success": False, "status": "unconfigured", "message": reason}

    target_url = api_url or f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message_text},
    }

    try:
        resp = requests.post(target_url, headers=headers, json=payload, timeout=8)
        if resp.status_code in (200, 201):
            _update_outbox_status(outbox_id, "sent", None, conn_factory, sent=True)
            return {"success": True, "status": "sent"}
        else:
            err_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
            _update_outbox_status(outbox_id, "failed", err_msg, conn_factory)
            return {"success": False, "status": "failed", "error": err_msg}
    except Exception as e:
        err_msg = f"Network/Gateway exception: {str(e)[:200]}"
        _update_outbox_status(outbox_id, "failed", err_msg, conn_factory)
        return {"success": False, "status": "failed", "error": err_msg}


def _update_outbox_status(outbox_id: int, status: str, error_text: str | None, conn_factory, sent: bool = False):
    if not outbox_id or not conn_factory:
        return
    try:
        conn = conn_factory()
        cur = conn.cursor()
        cur.execute("""
            UPDATE whatsapp_outbox
            SET status = %s,
                attempts = attempts + 1,
                last_error = %s,
                sent_at = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE sent_at END
            WHERE id = %s;
        """, (status, error_text, sent, outbox_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to update whatsapp_outbox status: {e}")

