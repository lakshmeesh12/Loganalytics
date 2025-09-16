import pika
import json
import logging
import os
from datetime import datetime
from dotenv import load_dotenv
import uuid

load_dotenv()

class RabbitMQClient:
    def __init__(self):
        self.logger = logging.getLogger("RabbitMQClient")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/rabbitmq.log"),
                logging.StreamHandler()
            ]
        )
        self.connection = None
        self.channel = None
        self.exchange = "incident_exchange"
        user = os.getenv("ENPLIFY_QUEUE_USER", "guest")
        password = os.getenv("ENPLIFY_QUEUE_PASS", "guest")
        queue_url_tmpl = os.getenv("ENPLIFY_QUEUE_URL_TMPL", "amqp://{user}:{password}@localhost:5672/")
        self.url = queue_url_tmpl.format(user=user, password=password)
        self.logger.info(f"Initialized RabbitMQClient with URL: {self.url.replace(password, '****')}")
    
    def connect(self):
        try:
            parameters = pika.URLParameters(self.url)
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            self.channel.exchange_declare(exchange=self.exchange, exchange_type='topic', durable=True)
            self.logger.info("Connected to RabbitMQ and declared exchange")
        except Exception as e:
            self.logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    def create_queue(self, queue_name):
        try:
            self.channel.queue_declare(queue=queue_name, durable=True)
            self.logger.info(f"Created queue: {queue_name}")
        except Exception as e:
            self.logger.error(f"Failed to create queue {queue_name}: {e}")
            raise

    def publish_message(self, routing_key, message):
        try:
            self.channel.basic_publish(
                exchange=self.exchange,
                routing_key=routing_key,
                body=json.dumps(message),
                properties=pika.BasicProperties(delivery_mode=2)
            )
            self.logger.info(f"Published message to {routing_key}: {json.dumps(message)[:100]}...")
        except Exception as e:
            self.logger.error(f"Failed to publish message to {routing_key}: {e}")
            raise

    def consume_messages(self, queue_name, callback, auto_ack=True):
        try:
            self.channel.basic_consume(queue=queue_name, on_message_callback=callback, auto_ack=auto_ack)
            self.logger.info(f"Started consuming messages from {queue_name}")
            self.channel.start_consuming()
        except Exception as e:
            self.logger.error(f"Error consuming messages from {queue_name}: {e}")
            raise

    def create_incident_message(self, incident_id, agent, action_type, details, source, status):
        message = {
            "id": str(uuid.uuid4()),
            "incident_id": incident_id,
            "agent": agent,
            "action_type": action_type,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
            "source": source,
            "status": status
        }
        return message

    def close(self):
        try:
            if self.channel:
                self.channel.close()
            if self.connection:
                self.connection.close()
            self.logger.info("Closed RabbitMQ connection")
        except Exception as e:
            self.logger.error(f"Error closing RabbitMQ connection: {e}")