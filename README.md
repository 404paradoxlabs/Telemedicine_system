# ORIGEN ONE GHANA — GOLD COAST Telemedicine System V5

This is a runnable FastAPI + frontend starter project for **ORIGEN ONE GHANA** with the subscript/brand line **GOLD COAST**. The branding change applies across the landing page, patient portal, doctor portal, admin portal, consultation room, API root, and backend language packs.

## What is included

- Patient self-signup and login
- Doctor and admin login
- Patient, doctor, and admin dashboards
- AI medical screening
- Real AI chatbot API integration point using an OpenAI-compatible Chat Completions API
- Rule-based medical chatbot fallback when no API key is configured
- Doctor/specialty recommendation
- Emergency red-flag guidance
- Appointment booking
- Booking consultation for self or for family/another person
- Doctor availability visible to patients before booking
- Online payment mock module
- Medical record upload
- Video/audio WebRTC consultation room
- Prescription module
- Patient timeline
- Admin analytics
- User-visible audit logs
- System-wide multilingual translation
- Dark mode across the interface
- Email/SMS-ready registration, booking, and reminder notifications
- User-configurable notification/reminder frequency

## Important positioning

This is an **online telemedicine platform**, not a full hospital management system. It does not include wards, admission, surgery, pharmacy inventory, physical laboratory workflows, ambulance, or inpatient management.

## Recommended Python version

Use **Python 3.11**. Avoid Python 3.14 for this project because some packages may try to build native wheels.

## Run on Windows PowerShell

```powershell
cd C:\Users\Admin\Downloads\telemedicine_system_v5_origen_one_ghana

py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt

Remove-Item .\telemedicine.db -ErrorAction SilentlyContinue

python -m app.seed
python -m uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/static/index.html
```

API docs:

```text
http://127.0.0.1:8000/docs
```

## Seeded accounts

```text
Patient:
patient@telemedapp.com
Patient@12345

Doctor:
doctor@telemedapp.com
Doctor@12345

Admin:
admin@telemedapp.com
Admin@12345
```

## AI chatbot API integration

The chatbot uses a real configurable OpenAI-compatible Chat Completions API when an API key is provided. Without the API key, the system still runs using a local rule-based fallback.

Set these environment variables before running the server:

```powershell
$env:OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
$env:OPENAI_MODEL="gpt-4o-mini"
$env:OPENAI_API_BASE="https://api.openai.com/v1"

python -m uvicorn app.main:app --reload
```

The chatbot prompt is safety-controlled: it must not diagnose or prescribe. It collects symptoms, recommends a suitable specialty, flags emergency red flags, and tells the patient to seek urgent physical care when necessary.

## Translation API integration

The multilingual feature now translates the **entire visible interface**, including static labels, headings, menu items, form placeholders, buttons, table headings, alerts, and dynamically loaded content.

Supported languages:

- English
- French
- Twi
- Ewe
- Ga
- Hausa
- Arabic
- Spanish
- Portuguese
- Swahili

### Option A: Google Translation API key

```powershell
$env:TRANSLATION_PROVIDER="google"
$env:GOOGLE_TRANSLATE_API_KEY="YOUR_GOOGLE_TRANSLATE_API_KEY"
```

### Option B: LibreTranslate-compatible API

```powershell
$env:TRANSLATION_PROVIDER="libretranslate"
$env:TRANSLATION_API_URL="http://localhost:5000/translate"
$env:TRANSLATION_API_KEY="optional-api-key"
```

When no external translation provider is configured, the system uses local fallback dictionaries for key platform terms. For medical production use, review translations clinically before deployment.

## Branding

Brand name:

```text
ORIGEN ONE GHANA
```

Subscript/brand line:

```text
GOLD COAST
```

Logo mark:

```text
O1+
```

The visual logo displays as **O1** with a medical-style plus mark in the corner.

## Email/SMS notification provider setup

By default, notification deliveries are recorded as mock delivery records. To send real messages, configure providers.

### SMTP email

```powershell
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your_email@example.com"
$env:SMTP_PASSWORD="your_password"
$env:SMTP_FROM="no-reply@yourdomain.com"
```

### SMS webhook

```powershell
$env:SMS_WEBHOOK_URL="https://your-sms-provider/send"
$env:SMS_API_KEY="your_sms_api_key"
```

## Reminder settings

Users can configure:

- Email notifications on/off
- SMS notifications on/off
- Reminder frequency:
  - No reminders
  - Booking confirmations only
  - 24 hours and 1 hour before
  - 12 hours and 1 hour before
  - 6 hours and 30 minutes before
  - Daily at 9am until consultation

Reminder processing endpoint:

```text
POST /api/notifications/process-reminders
```

## Main pages

```text
/static/index.html
/static/signup.html
/static/patient-dashboard.html
/static/doctor-dashboard.html
/static/admin-dashboard.html
/static/consultation.html?appointment_id=<appointment_id>
```

## Notes

- The payment system is still a development/mock payment module.
- Uploaded files are stored locally under `app/uploads`.
- For production WebRTC video/audio, configure a TURN server.
- For real production healthcare use, validate AI, translations, consent, audit logs, and privacy controls with clinical/legal reviewers.


## V5.1 Fixes

- Full-system translation now uses a final DOM-wide translation layer that covers headings, menus, cards, tables, buttons, select options, placeholders, title/aria labels, image alt text, and dynamically rendered content.
- Translation API fallback now supports MyMemory public API when no Google/LibreTranslate key is configured. For best production quality, still configure Google Translate or LibreTranslate.
- AI screening summaries are now patient-facing. They use direct wording such as "You reported..." and "Your preliminary risk level is..." instead of third-person wording.

Optional translation provider settings:

```powershell
# Production recommended
$env:TRANSLATION_PROVIDER="google"
$env:GOOGLE_TRANSLATE_API_KEY="YOUR_GOOGLE_TRANSLATE_API_KEY"

# Self-hosted/LibreTranslate
$env:TRANSLATION_PROVIDER="libretranslate"
$env:TRANSLATION_API_URL="http://localhost:5000/translate"
$env:TRANSLATION_API_KEY="optional-api-key"

# Demo fallback, no key required but rate-limited and not ideal for medical production
$env:TRANSLATION_PROVIDER="mymemory"
```
