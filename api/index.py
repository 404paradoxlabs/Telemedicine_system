import sys
import os

# Add project root to sys.path so app module imports work correctly on Vercel
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
