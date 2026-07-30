import os
import sys

BASE_DIR = "/home/yuangouz/yuango/YuanGo"

sys.path.insert(0, BASE_DIR)

# .env ni loyiha papkasidan yuklash
os.chdir(BASE_DIR)
from dotenv import load_dotenv

load_dotenv(os.path.join(BASE_DIR, ".env"))

from main import app, start_background_services

# Passenger Flask + Telegram botni ishga tushiradi
start_background_services()

application = app
