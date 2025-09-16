from fastapi import WebSocket
import json
from websockets.exceptions import ConnectionClosed
import asyncio

# Store active WebSocket connections
connected_clients = set()

async def broadcast_error(error_data: dict):
    """Broadcast error data to all connected WebSocket clients."""
    if connected_clients:
        disconnected_clients = set()
        for client in connected_clients:
            try:
                await client.send_text(json.dumps(error_data))
            except ConnectionClosed:
                disconnected_clients.add(client)
        connected_clients.difference_update(disconnected_clients)