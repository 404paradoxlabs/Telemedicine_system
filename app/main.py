import json
import html
import os
import uuid
import httpx
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta, time as dt_time
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from jose import JWTError, jwt

from .ai_screening import analyze_screening
from .auth import ALGORITHM, SECRET_KEY, create_access_token, get_current_user, hash_password, require_role, verify_password
from .database import Base, SessionLocal, engine, get_db
from .models import (
    AIScreening,
    Appointment,
    AppointmentStatus,
    AuditLog,
    ChatbotMessage,
    ChatbotSession,
    Complaint,
    ComplaintStatus,
    Consultation,
    Doctor,
    DoctorApprovalStatus,
    DoctorAvailability,
    MedicalRecord,
    Notification,
    NotificationDelivery,
    ReminderSchedule,
    Patient,
    Payment,
    PaymentStatus,
    Prescription,
    PrescriptionItem,
    Review,
    ScreeningAnswer,
    ScreeningQuestion,
    PatientTimelineEvent,
    TranslationCache,
    User,
    UserPreference,
    UserRole,
)
from .schemas import (
    AIScreeningCreate,
    AIScreeningOut,
    AppointmentCreate,
    AppointmentOut,
    AnalyticsOut,
    AuditLogOut,
    ChatbotMessageCreate,
    ChatbotResponse,
    ComplaintCreate,
    ComplaintOut,
    ConsultationCreate,
    ConsultationOut,
    DashboardStats,
    DoctorAvailabilityCreate,
    DoctorAvailabilityOut,
    DoctorOut,
    DoctorUpdate,
    LoginRequest,
    MedicalRecordOut,
    PatientOut,
    PatientUpdate,
    PaymentCreate,
    PaymentOut,
    NotificationDeliveryOut,
    ReminderScheduleOut,
    DoctorAvailabilityPublicOut,
    PrescriptionCreate,
    PrescriptionOut,
    RegisterRequest,
    ReviewCreate,
    ReviewOut,
    ScreeningQuestionCreate,
    ScreeningQuestionOut,
    PatientTimelineEventOut,
    Token,
    TranslationRequest,
    TranslationResponse,
    UILanguagePackOut,
    UserPreferenceOut,
    UserPreferenceUpdate,
    UserOut,
)

Base.metadata.create_all(bind=engine)

ROOT_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = ROOT_DIR / "app" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="ORIGEN ONE GHANA GOLD COAST Telemedicine API",
    description="ORIGEN ONE GHANA GOLD COAST online telemedicine platform with AI chatbot, full multilingual translation, appointments, payments, consultations, records, and prescriptions.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/static", StaticFiles(directory=str(ROOT_DIR / "frontend")), name="static")

BRAND_NAME = "ORIGEN ONE GHANA"
BRAND_SUBTITLE = "GOLD COAST"
BRAND_LOGO_TEXT = "O1"


@app.get("/api/branding")
def branding():
    return {
        "name": BRAND_NAME,
        "subtitle": BRAND_SUBTITLE,
        "logo_text": BRAND_LOGO_TEXT,
        "full_name": f"{BRAND_NAME} — {BRAND_SUBTITLE}",
    }


# ----------------------------- Helpers -----------------------------

SUPPORTED_LANGUAGES = [
    {"code": "en", "api_code": "en", "name": "English", "native_name": "English", "speech_locale": "en-US", "direction": "ltr"},
    {"code": "fr", "api_code": "fr", "name": "French", "native_name": "Français", "speech_locale": "fr-FR", "direction": "ltr"},
    {"code": "tw", "api_code": "tw", "name": "Twi", "native_name": "Twi", "speech_locale": "en-GH", "direction": "ltr"},
    {"code": "ee", "api_code": "ee", "name": "Ewe", "native_name": "Eʋegbe", "speech_locale": "en-GH", "direction": "ltr"},
    {"code": "gaa", "api_code": "gaa", "name": "Ga", "native_name": "Ga", "speech_locale": "en-GH", "direction": "ltr"},
    {"code": "ha", "api_code": "ha", "name": "Hausa", "native_name": "Hausa", "speech_locale": "ha-NG", "direction": "ltr"},
    {"code": "ar", "api_code": "ar", "name": "Arabic", "native_name": "العربية", "speech_locale": "ar-SA", "direction": "rtl"},
    {"code": "es", "api_code": "es", "name": "Spanish", "native_name": "Español", "speech_locale": "es-ES", "direction": "ltr"},
    {"code": "pt", "api_code": "pt", "name": "Portuguese", "native_name": "Português", "speech_locale": "pt-PT", "direction": "ltr"},
    {"code": "sw", "api_code": "sw", "name": "Swahili", "native_name": "Kiswahili", "speech_locale": "sw-KE", "direction": "ltr"},
]

LANGUAGE_BY_CODE = {lang["code"]: lang for lang in SUPPORTED_LANGUAGES}

# UI text packs are intentionally stored on the backend so the frontend pulls interface text from an API.
# For unsupported dynamic phrases, /api/localization/translate can call an external LibreTranslate-compatible API.
UI_LANGUAGE_PACKS = {
    "en": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Overview", "doctors": "Find Doctors", "screening": "AI Screening", "chatbot": "AI Chatbot", "timeline": "Timeline", "booking": "Book Appointment", "payments": "Payments", "records": "Medical Records", "prescriptions": "Prescriptions", "profile": "Profile", "settings": "Settings", "analytics": "Analytics", "audit": "Audit Logs", "users": "Users", "complaints": "Complaints", "logout": "Logout", "patient.dashboard": "Patient Dashboard", "doctor.dashboard": "Doctor Dashboard", "admin.dashboard": "Admin Console", "language.settings": "Language and Display Settings", "preferred.language": "Preferred Language", "theme": "Theme", "light.mode": "Light Mode", "dark.mode": "Dark Mode", "save.preferences": "Save Preferences", "translation.preview": "Translation Preview", "current.language": "Current language", "approved.doctors": "Approved Doctors", "appointments": "Appointments", "notifications": "Notifications", "recent.appointments": "Recent Appointments", "send": "Send", "speak": "Speak", "run.screening": "Run Screening", "upload.record": "Upload Medical Record", "pay.now": "Pay Now", "create.appointment": "Create Appointment", "profile.medical": "Profile and Medical Background"
    },
    "fr": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Aperçu", "doctors": "Trouver des médecins", "screening": "Dépistage IA", "chatbot": "Chatbot IA", "timeline": "Chronologie", "booking": "Prendre rendez-vous", "payments": "Paiements", "records": "Dossiers médicaux", "prescriptions": "Ordonnances", "profile": "Profil", "settings": "Paramètres", "analytics": "Analytique", "audit": "Journaux d’audit", "users": "Utilisateurs", "complaints": "Plaintes", "logout": "Déconnexion", "patient.dashboard": "Tableau de bord patient", "doctor.dashboard": "Tableau de bord médecin", "admin.dashboard": "Console administrateur", "language.settings": "Paramètres de langue et d’affichage", "preferred.language": "Langue préférée", "theme": "Thème", "light.mode": "Mode clair", "dark.mode": "Mode sombre", "save.preferences": "Enregistrer les préférences", "translation.preview": "Aperçu de traduction", "current.language": "Langue actuelle", "approved.doctors": "Médecins approuvés", "appointments": "Rendez-vous", "notifications": "Notifications", "recent.appointments": "Rendez-vous récents", "send": "Envoyer", "speak": "Parler", "run.screening": "Lancer le dépistage", "upload.record": "Téléverser un dossier médical", "pay.now": "Payer maintenant", "create.appointment": "Créer un rendez-vous", "profile.medical": "Profil et antécédents médicaux"
    },
    "tw": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Nsɛm a ɛda so", "doctors": "Hwehwɛ Dokita", "screening": "AI Nhwehwɛmu", "chatbot": "AI Nkɔmmɔ", "timeline": "Bere nhyehyɛe", "booking": "Yɛ Nhyehyɛe", "payments": "Sika Tua", "records": "Ayaresa Ho Nsɛm", "prescriptions": "Aduru Krataa", "profile": "Profile", "settings": "Nhyehyɛe", "analytics": "Nhwehwɛmu", "audit": "Audit Logs", "users": "Users", "complaints": "Anwiinwii", "logout": "Fi mu", "patient.dashboard": "Patient Dashboard", "doctor.dashboard": "Doctor Dashboard", "admin.dashboard": "Admin Console", "language.settings": "Kasa ne display nhyehyɛe", "preferred.language": "Kasa a wopɛ", "theme": "Theme", "light.mode": "Light Mode", "dark.mode": "Dark Mode", "save.preferences": "Fa sie", "translation.preview": "Nkyerɛase nhwɛso", "current.language": "Kasa a ɛreyɛ adwuma", "approved.doctors": "Doctors a wɔapene wɔn so", "appointments": "Appointments", "notifications": "Nkaebɔ", "recent.appointments": "Appointments a aba foforo", "send": "Soma", "speak": "Kasa", "run.screening": "Hyɛ screening ase", "upload.record": "Fa medical record kɔ", "pay.now": "Tua seesei", "create.appointment": "Yɛ appointment", "profile.medical": "Profile ne ayaresa ho nsɛm"
    },
    "ee": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Dzesiɖeɖe", "doctors": "Dii Dɔkta", "screening": "AI Dzedze", "chatbot": "AI Dzeɖoɖo", "timeline": "Ɣeyiɣi nuŋlɔɖi", "booking": "Dze ŋkeke", "payments": "Fexexewo", "records": "Lãmesẽ nuŋlɔɖiwo", "prescriptions": "Atikekewo", "profile": "Profile", "settings": "Ðoɖowo", "analytics": "Numekuku", "audit": "Audit Logs", "users": "Users", "complaints": "Nunyawo", "logout": "Do go", "patient.dashboard": "Patient Dashboard", "doctor.dashboard": "Doctor Dashboard", "admin.dashboard": "Admin Console", "language.settings": "Gbe kple ŋkuɖoɖo ƒe ɖoɖowo", "preferred.language": "Gbe si nèdi", "theme": "Theme", "light.mode": "Light Mode", "dark.mode": "Dark Mode", "save.preferences": "Dzra ɖoɖowo ɖo", "translation.preview": "Gbe gɔmeɖeɖe kpɔɖeŋu", "current.language": "Gbe si le edzi", "approved.doctors": "Dɔktawo siwo woɖe mɔ", "appointments": "Ŋkekewo", "notifications": "Nyadzɔdzɔwo", "recent.appointments": "Ŋkeke yeyeawo", "send": "Dɔ ɖa", "speak": "ƒo nu", "run.screening": "Dze screening egɔme", "upload.record": "De medical record ɖa", "pay.now": "Xe fe fifia", "create.appointment": "Wɔ appointment", "profile.medical": "Profile kple lãmesẽ ŋutinya"
    },
    "gaa": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Nɔkwɛmɔ", "doctors": "Hwe Dokita", "screening": "AI Screening", "chatbot": "AI Kɛkɛeli", "timeline": "Gbɛjianɔŋ", "booking": "Yɛ appointment", "payments": "Feei", "records": "Yitsoŋmɔ wiemɔ", "prescriptions": "Lɛkɔɔ krataa", "profile": "Profile", "settings": "Settings", "analytics": "Analytics", "audit": "Audit Logs", "users": "Users", "complaints": "Kasa anaa nɔŋwala", "logout": "Fi eko", "patient.dashboard": "Patient Dashboard", "doctor.dashboard": "Doctor Dashboard", "admin.dashboard": "Admin Console", "language.settings": "Kɛ kasa kɛ display settings", "preferred.language": "Kasa ni ofee", "theme": "Theme", "light.mode": "Light Mode", "dark.mode": "Dark Mode", "save.preferences": "Save settings", "translation.preview": "Translation preview", "current.language": "Kasa ni eji", "approved.doctors": "Dokita ni wɔapene", "appointments": "Appointments", "notifications": "Notifications", "recent.appointments": "Appointments foforo", "send": "Soma", "speak": "Kasa", "run.screening": "Run screening", "upload.record": "Upload medical record", "pay.now": "Pay now", "create.appointment": "Create appointment", "profile.medical": "Profile ne medical background"
    },
    "ha": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Taƙaitawa", "doctors": "Nemo Likitoci", "screening": "Binciken AI", "chatbot": "AI Mai Tattaunawa", "timeline": "Jadawalin lokaci", "booking": "Yi alƙawari", "payments": "Biyan kuɗi", "records": "Bayanan lafiya", "prescriptions": "Takardar magani", "profile": "Bayani", "settings": "Saituna", "analytics": "Nazari", "audit": "Rajistar bincike", "users": "Masu amfani", "complaints": "Korafe-korafe", "logout": "Fita", "patient.dashboard": "Dashibodin mara lafiya", "doctor.dashboard": "Dashibodin likita", "admin.dashboard": "Kwamitin admin", "language.settings": "Saitunan harshe da nuni", "preferred.language": "Harshen da aka fi so", "theme": "Jigo", "light.mode": "Yanayin haske", "dark.mode": "Yanayin duhu", "save.preferences": "Ajiye saituna", "translation.preview": "Samfurin fassara", "current.language": "Harshen yanzu", "approved.doctors": "Likitocin da aka amince", "appointments": "Alƙawura", "notifications": "Sanarwa", "recent.appointments": "Sabbin alƙawura", "send": "Aika", "speak": "Yi magana", "run.screening": "Gudanar da bincike", "upload.record": "Loda bayanan lafiya", "pay.now": "Biya yanzu", "create.appointment": "Ƙirƙiri alƙawari", "profile.medical": "Bayani da tarihin lafiya"
    },
    "ar": {
        "app.name": "ORIGEN ONE GHANA", "overview": "نظرة عامة", "doctors": "البحث عن الأطباء", "screening": "الفحص بالذكاء الاصطناعي", "chatbot": "مساعد الذكاء الاصطناعي", "timeline": "الخط الزمني", "booking": "حجز موعد", "payments": "المدفوعات", "records": "السجلات الطبية", "prescriptions": "الوصفات", "profile": "الملف الشخصي", "settings": "الإعدادات", "analytics": "التحليلات", "audit": "سجلات التدقيق", "users": "المستخدمون", "complaints": "الشكاوى", "logout": "تسجيل الخروج", "patient.dashboard": "لوحة تحكم المريض", "doctor.dashboard": "لوحة تحكم الطبيب", "admin.dashboard": "لوحة الإدارة", "language.settings": "إعدادات اللغة والعرض", "preferred.language": "اللغة المفضلة", "theme": "المظهر", "light.mode": "الوضع الفاتح", "dark.mode": "الوضع الداكن", "save.preferences": "حفظ التفضيلات", "translation.preview": "معاينة الترجمة", "current.language": "اللغة الحالية", "approved.doctors": "الأطباء المعتمدون", "appointments": "المواعيد", "notifications": "الإشعارات", "recent.appointments": "المواعيد الأخيرة", "send": "إرسال", "speak": "تحدث", "run.screening": "تشغيل الفحص", "upload.record": "رفع سجل طبي", "pay.now": "ادفع الآن", "create.appointment": "إنشاء موعد", "profile.medical": "الملف والخلفية الطبية"
    },
    "es": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Resumen", "doctors": "Buscar médicos", "screening": "Evaluación IA", "chatbot": "Chatbot IA", "timeline": "Cronología", "booking": "Reservar cita", "payments": "Pagos", "records": "Registros médicos", "prescriptions": "Recetas", "profile": "Perfil", "settings": "Configuración", "analytics": "Analítica", "audit": "Registros de auditoría", "users": "Usuarios", "complaints": "Quejas", "logout": "Cerrar sesión", "patient.dashboard": "Panel del paciente", "doctor.dashboard": "Panel del médico", "admin.dashboard": "Consola de administración", "language.settings": "Configuración de idioma y pantalla", "preferred.language": "Idioma preferido", "theme": "Tema", "light.mode": "Modo claro", "dark.mode": "Modo oscuro", "save.preferences": "Guardar preferencias", "translation.preview": "Vista previa de traducción", "current.language": "Idioma actual", "approved.doctors": "Médicos aprobados", "appointments": "Citas", "notifications": "Notificaciones", "recent.appointments": "Citas recientes", "send": "Enviar", "speak": "Hablar", "run.screening": "Ejecutar evaluación", "upload.record": "Subir registro médico", "pay.now": "Pagar ahora", "create.appointment": "Crear cita", "profile.medical": "Perfil y antecedentes médicos"
    },
    "pt": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Visão geral", "doctors": "Encontrar médicos", "screening": "Triagem por IA", "chatbot": "Chatbot IA", "timeline": "Linha do tempo", "booking": "Marcar consulta", "payments": "Pagamentos", "records": "Registos médicos", "prescriptions": "Receitas", "profile": "Perfil", "settings": "Definições", "analytics": "Analítica", "audit": "Registos de auditoria", "users": "Utilizadores", "complaints": "Reclamações", "logout": "Terminar sessão", "patient.dashboard": "Painel do paciente", "doctor.dashboard": "Painel do médico", "admin.dashboard": "Consola de administração", "language.settings": "Definições de idioma e visualização", "preferred.language": "Idioma preferido", "theme": "Tema", "light.mode": "Modo claro", "dark.mode": "Modo escuro", "save.preferences": "Guardar preferências", "translation.preview": "Pré-visualização da tradução", "current.language": "Idioma atual", "approved.doctors": "Médicos aprovados", "appointments": "Consultas", "notifications": "Notificações", "recent.appointments": "Consultas recentes", "send": "Enviar", "speak": "Falar", "run.screening": "Executar triagem", "upload.record": "Carregar registo médico", "pay.now": "Pagar agora", "create.appointment": "Criar consulta", "profile.medical": "Perfil e antecedentes médicos"
    },
    "sw": {
        "app.name": "ORIGEN ONE GHANA", "overview": "Muhtasari", "doctors": "Tafuta madaktari", "screening": "Uchunguzi wa AI", "chatbot": "AI Chatbot", "timeline": "Muda wa matukio", "booking": "Weka miadi", "payments": "Malipo", "records": "Rekodi za matibabu", "prescriptions": "Maagizo ya dawa", "profile": "Wasifu", "settings": "Mipangilio", "analytics": "Takwimu", "audit": "Kumbukumbu za ukaguzi", "users": "Watumiaji", "complaints": "Malalamiko", "logout": "Toka", "patient.dashboard": "Dashibodi ya mgonjwa", "doctor.dashboard": "Dashibodi ya daktari", "admin.dashboard": "Dashibodi ya msimamizi", "language.settings": "Mipangilio ya lugha na mwonekano", "preferred.language": "Lugha unayopendelea", "theme": "Mandhari", "light.mode": "Mwanga", "dark.mode": "Giza", "save.preferences": "Hifadhi mapendeleo", "translation.preview": "Onyesho la tafsiri", "current.language": "Lugha ya sasa", "approved.doctors": "Madaktari walioidhinishwa", "appointments": "Miadi", "notifications": "Arifa", "recent.appointments": "Miadi ya karibuni", "send": "Tuma", "speak": "Ongea", "run.screening": "Anzisha uchunguzi", "upload.record": "Pakia rekodi ya matibabu", "pay.now": "Lipa sasa", "create.appointment": "Unda miadi", "profile.medical": "Wasifu na historia ya matibabu"
    },
}

UI_LANGUAGE_PACKS["en"].update({
    "patient.summary": "Patient Summary",
    "consultation.notes": "Consultation Notes",
    "translation.api": "Translation API Test",
    "translation.api.hint": "Type text and translate it through the backend translation API.",
    "text.to.translate": "Text to translate",
    "translate.now": "Translate Now",
})

TRANSLATION_DICTIONARY = {
    lang: {value.lower(): value for value in pack.values()} for lang, pack in UI_LANGUAGE_PACKS.items()
}
TRANSLATABLE_SOURCE = UI_LANGUAGE_PACKS["en"]
for lang, pack in UI_LANGUAGE_PACKS.items():
    TRANSLATION_DICTIONARY[lang].update({src.lower(): pack.get(key, src) for key, src in TRANSLATABLE_SOURCE.items()})



def log_action(
    db: Session,
    user_id: str | None,
    action: str,
    entity: str | None = None,
    entity_id: str | None = None,
    outcome: str = "success",
    details: str | None = None,
):
    user = db.get(User, user_id) if user_id else None
    db.add(
        AuditLog(
            user_id=user_id,
            user_name=user.full_name if user else None,
            user_role=user.role.value if user else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            outcome=outcome,
            details=details,
        )
    )


def send_email_message(recipient: str, subject: str, message: str) -> tuple[str, str]:
    """Send through SMTP when configured; otherwise create a mock-success delivery."""
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if not smtp_host:
        return "sent_mock", "SMTP not configured; demo email delivery recorded as sent_mock."

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM", smtp_user or "no-reply@telemedapp.com").strip()

    email = EmailMessage()
    email["From"] = sender
    email["To"] = recipient
    email["Subject"] = subject
    email.set_content(message)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(email)
        return "sent", "SMTP delivery successful."
    except Exception as exc:
        return "failed", str(exc)[:500]


def send_sms_message(recipient: str, message: str) -> tuple[str, str]:
    """Send through a webhook-compatible SMS gateway when configured; otherwise mock-send."""
    sms_url = os.getenv("SMS_WEBHOOK_URL", "").strip()
    if not sms_url:
        return "sent_mock", "SMS gateway not configured; demo SMS delivery recorded as sent_mock."
    payload = {"to": recipient, "message": message, "api_key": os.getenv("SMS_API_KEY", "")}
    try:
        with httpx.Client(timeout=10) as client:
            response = client.post(sms_url, json=payload)
            response.raise_for_status()
            return "sent", response.text[:500]
    except Exception as exc:
        return "failed", str(exc)[:500]


def create_delivery_record(
    db: Session,
    user: User,
    notification: Notification | None,
    channel: str,
    recipient: str,
    title: str,
    message: str,
):
    if channel == "email":
        status, provider_response = send_email_message(recipient, title, message)
    elif channel == "sms":
        status, provider_response = send_sms_message(recipient, f"{title}: {message}")
    else:
        status, provider_response = "skipped", "Unsupported channel."
    db.add(
        NotificationDelivery(
            notification_id=notification.id if notification else None,
            user_id=user.id,
            channel=channel,
            recipient=recipient,
            subject=title,
            message=message,
            status=status,
            provider_response=provider_response,
            sent_at=datetime.utcnow() if status.startswith("sent") else None,
        )
    )


def create_notification(
    db: Session,
    user_id: str,
    title: str,
    message: str,
    type_: str,
    force_email: bool = False,
    force_sms: bool = False,
):
    notification = Notification(user_id=user_id, title=title, message=message, type=type_)
    db.add(notification)
    db.flush()

    user = db.get(User, user_id)
    if not user:
        return notification
    preference = ensure_preference(db, user_id)
    if user.email and (force_email or preference.email_notifications):
        create_delivery_record(db, user, notification, "email", user.email, title, message)
    if user.phone and (force_sms or preference.sms_notifications):
        create_delivery_record(db, user, notification, "sms", user.phone, title, message)
    return notification


def ensure_preference(db: Session, user_id: str) -> UserPreference:
    preference = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not preference:
        preference = UserPreference(user_id=user_id, language="en", theme="light")
        db.add(preference)
        db.flush()
    return preference


def add_timeline_event(
    db: Session,
    patient_id: str,
    event_type: str,
    title: str,
    description: str | None = None,
    related_entity: str | None = None,
    related_entity_id: str | None = None,
):
    db.add(
        PatientTimelineEvent(
            patient_id=patient_id,
            event_type=event_type,
            title=title,
            description=description,
            related_entity=related_entity,
            related_entity_id=related_entity_id,
        )
    )


def get_patient_or_403(current_user: User) -> Patient:
    if not current_user.patient_profile:
        raise HTTPException(status_code=403, detail="Patient profile not found")
    return current_user.patient_profile


def get_doctor_or_403(current_user: User) -> Doctor:
    if not current_user.doctor_profile:
        raise HTTPException(status_code=403, detail="Doctor profile not found")
    return current_user.doctor_profile


def ensure_approved_doctor(doctor: Doctor):
    if doctor.approval_status != DoctorApprovalStatus.approved:
        raise HTTPException(status_code=403, detail="Doctor account is not approved")


def generate_consultation_link(appointment_id: str) -> str:
    return f"/static/consultation.html?appointment_id={appointment_id}"


def appointment_access_filter(query, current_user: User):
    if current_user.role == UserRole.patient:
        patient = get_patient_or_403(current_user)
        return query.filter(Appointment.patient_id == patient.id)
    if current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        return query.filter(Appointment.doctor_id == doctor.id)
    return query


def appointment_datetime(appointment: Appointment) -> datetime:
    return datetime.combine(appointment.appointment_date, appointment.appointment_time)


def appointment_weekday_name(appointment_date) -> str:
    return appointment_date.strftime("%A")


def doctor_slots_for_date(db: Session, doctor_id: str, appointment_date):
    day = appointment_weekday_name(appointment_date)
    return (
        db.query(DoctorAvailability)
        .filter(
            DoctorAvailability.doctor_id == doctor_id,
            DoctorAvailability.day_of_week == day,
            DoctorAvailability.is_available.is_(True),
        )
        .order_by(DoctorAvailability.start_time.asc())
        .all()
    )


def validate_doctor_available_for_appointment(db: Session, doctor_id: str, appointment_date, appointment_time_value):
    slots = doctor_slots_for_date(db, doctor_id, appointment_date)
    if not slots:
        raise HTTPException(status_code=400, detail=f"Doctor is not available on {appointment_weekday_name(appointment_date)}")
    if not any(slot.start_time <= appointment_time_value < slot.end_time for slot in slots):
        slot_text = ", ".join(f"{slot.start_time.strftime('%H:%M')}-{slot.end_time.strftime('%H:%M')}" for slot in slots)
        raise HTTPException(status_code=400, detail=f"Selected time is outside doctor's available slots: {slot_text}")
    existing = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date == appointment_date,
            Appointment.appointment_time == appointment_time_value,
            Appointment.status.notin_([AppointmentStatus.cancelled, AppointmentStatus.missed]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Doctor already has an appointment at this date and time")


def reminder_offsets_for_frequency(frequency: str, appointment_dt: datetime) -> list[timedelta]:
    frequency = frequency or "24h_and_1h"
    mapping = {
        "none": [],
        "booking_only": [],
        "24h_and_1h": [timedelta(hours=24), timedelta(hours=1)],
        "12h_and_1h": [timedelta(hours=12), timedelta(hours=1)],
        "6h_and_30m": [timedelta(hours=6), timedelta(minutes=30)],
    }
    if frequency != "daily_9am_until_due":
        return mapping.get(frequency, mapping["24h_and_1h"])
    now = datetime.utcnow()
    offsets: list[timedelta] = [timedelta(hours=1)]
    cursor = datetime.combine(now.date(), dt_time(9, 0))
    if cursor <= now:
        cursor += timedelta(days=1)
    while cursor < appointment_dt and len(offsets) < 10:
        offsets.append(appointment_dt - cursor)
        cursor += timedelta(days=1)
    return offsets


def schedule_reminders_for_user(db: Session, appointment: Appointment, user: User, role_label: str):
    preference = ensure_preference(db, user.id)
    appt_dt = appointment_datetime(appointment)
    channels = []
    if preference.email_notifications and user.email:
        channels.append("email")
    if preference.sms_notifications and user.phone:
        channels.append("sms")
    title = "Consultation Reminder"
    message = (
        f"Reminder: You have a {appointment.consultation_type.value} consultation as {role_label} "
        f"on {appointment.appointment_date} at {appointment.appointment_time.strftime('%H:%M')}."
    )
    for offset in reminder_offsets_for_frequency(preference.reminder_frequency, appt_dt):
        remind_at = appt_dt - offset
        if remind_at <= datetime.utcnow():
            continue
        for channel in channels:
            exists = db.query(ReminderSchedule).filter(
                ReminderSchedule.appointment_id == appointment.id,
                ReminderSchedule.user_id == user.id,
                ReminderSchedule.channel == channel,
                ReminderSchedule.remind_at == remind_at,
            ).first()
            if not exists:
                db.add(ReminderSchedule(
                    appointment_id=appointment.id,
                    user_id=user.id,
                    channel=channel,
                    remind_at=remind_at,
                    message=message,
                ))


def schedule_appointment_reminders(db: Session, appointment: Appointment):
    patient_user = db.get(Patient, appointment.patient_id).user
    doctor_user = db.get(Doctor, appointment.doctor_id).user
    schedule_reminders_for_user(db, appointment, patient_user, "patient/booking owner")
    schedule_reminders_for_user(db, appointment, doctor_user, "doctor")


def process_due_reminders(db: Session, user_id: str | None = None) -> int:
    query = db.query(ReminderSchedule).filter(
        ReminderSchedule.status == "scheduled",
        ReminderSchedule.remind_at <= datetime.utcnow(),
    )
    if user_id:
        query = query.filter(ReminderSchedule.user_id == user_id)
    reminders = query.limit(200).all()
    sent_count = 0
    for reminder in reminders:
        user = db.get(User, reminder.user_id)
        appointment = db.get(Appointment, reminder.appointment_id)
        if not user or not appointment:
            reminder.status = "skipped"
            continue
        recipient = user.email if reminder.channel == "email" else user.phone
        if not recipient:
            reminder.status = "skipped"
            continue
        status, response = (
            send_email_message(recipient, "Consultation Reminder", reminder.message)
            if reminder.channel == "email"
            else send_sms_message(recipient, reminder.message)
        )
        reminder.status = status
        reminder.sent_at = datetime.utcnow() if status.startswith("sent") else None
        db.add(Notification(user_id=user.id, title="Consultation Reminder", message=reminder.message, type="reminder"))
        log_action(db, user.id, f"processed {reminder.channel} reminder", "reminder_schedule", reminder.id, outcome=status, details=response)
        sent_count += 1
    return sent_count


# ----------------------------- Auth -----------------------------

@app.post("/api/auth/register", response_model=UserOut)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if payload.role == UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin users must be created by system owner or seed script")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()

    ensure_preference(db, user.id)

    if payload.role == UserRole.patient:
        patient = Patient(
            user_id=user.id,
            gender=payload.gender,
            date_of_birth=payload.date_of_birth,
            location=payload.location,
            emergency_contact=payload.emergency_contact,
        )
        db.add(patient)
        db.flush()
        add_timeline_event(
            db,
            patient.id,
            "registration",
            "Account created",
            "Patient self-registration completed successfully.",
            "patient",
            patient.id,
        )
        create_notification(
            db,
            user.id,
            "Registration Successful",
            "Your ORIGEN ONE GHANA patient account has been created successfully. You can now book online consultations.",
            "registration",
            force_email=bool(user.email),
            force_sms=bool(user.phone),
        )
    elif payload.role == UserRole.doctor:
        if not payload.license_number or not payload.specialty:
            raise HTTPException(status_code=400, detail="Doctors must provide license_number and specialty")
        doctor = Doctor(
            user_id=user.id,
            license_number=payload.license_number,
            specialty=payload.specialty,
            qualification=payload.qualification,
            experience_years=payload.experience_years,
            languages=payload.languages,
            consultation_fee=payload.consultation_fee,
            bio=payload.bio,
        )
        db.add(doctor)
        create_notification(
            db,
            user.id,
            "Doctor Registration Submitted",
            "Your doctor account is pending admin approval.",
            "doctor_registration",
            force_email=bool(user.email),
            force_sms=bool(user.phone),
        )

    log_action(db, user.id, "registered account", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(subject=user.id, role=user.role.value)
    return Token(access_token=token)


@app.get("/api/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ----------------------------- Preferences, language, theme -----------------------------

@app.get("/api/localization/languages")
def languages():
    return SUPPORTED_LANGUAGES


def ensure_supported_language(code: str) -> str:
    if code not in LANGUAGE_BY_CODE:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {code}")
    return code


def language_direction(code: str) -> str:
    return LANGUAGE_BY_CODE.get(code, LANGUAGE_BY_CODE["en"]).get("direction", "ltr")


def get_local_ui_pack(language: str) -> dict[str, str]:
    return {**UI_LANGUAGE_PACKS["en"], **UI_LANGUAGE_PACKS.get(language, {})}


def translate_locally(text: str, target_language: str) -> str:
    if target_language == "en":
        return text
    dictionary = TRANSLATION_DICTIONARY.get(target_language, {})
    return dictionary.get(text.lower(), text)


async def translate_with_external_api(text: str, source_language: str, target_language: str) -> tuple[str, str]:
    """Translate text through a configured provider, with safe local fallback.

    Supported providers:
    - LibreTranslate-compatible endpoint using TRANSLATION_API_URL and optional TRANSLATION_API_KEY
    - Google Translate Basic endpoint using GOOGLE_TRANSLATE_API_KEY

    Local-language fallbacks remain active for Twi, Ewe, and Ga because public MT coverage can be weak.
    """
    local_value = translate_locally(text, target_language)
    if target_language == "en":
        return text, "english_source"

    provider = os.getenv("TRANSLATION_PROVIDER", "auto").strip().lower()
    source_api_code = LANGUAGE_BY_CODE.get(source_language, LANGUAGE_BY_CODE["en"])["api_code"]
    target_api_code = LANGUAGE_BY_CODE.get(target_language, LANGUAGE_BY_CODE["en"])["api_code"]

    # Ghanaian/local language fallback first when no provider is configured.
    if target_language in {"tw", "ee", "gaa"} and provider in {"", "auto", "local"}:
        return local_value, "local_dictionary"

    # Google Translate Basic API key integration.
    google_key = os.getenv("GOOGLE_TRANSLATE_API_KEY", "").strip()
    if google_key and provider in {"auto", "google", "google_basic"}:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://translation.googleapis.com/language/translate/v2",
                    params={"key": google_key},
                    json={"q": text, "source": source_api_code, "target": target_api_code, "format": "text"},
                )
                response.raise_for_status()
                data = response.json()
                translated = data.get("data", {}).get("translations", [{}])[0].get("translatedText")
                if translated:
                    return translated, "google_translate_api"
        except Exception:
            pass

    # LibreTranslate/self-hosted/external compatible provider.
    api_url = os.getenv("TRANSLATION_API_URL", "").strip()
    if api_url and provider in {"auto", "libretranslate", "external", "external_api"}:
        payload = {"q": text, "source": source_api_code, "target": target_api_code, "format": "text"}
        api_key = os.getenv("TRANSLATION_API_KEY", "").strip()
        if api_key:
            payload["api_key"] = api_key
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(api_url, json=payload)
                response.raise_for_status()
                data = response.json()
                translated = data.get("translatedText") or data.get("translation") or data.get("translated_text")
                if translated:
                    return html.unescape(translated), "external_translation_api"
        except Exception:
            pass

    # MyMemory public translation API fallback for demo/full-interface translation when no paid key is configured.
    # This gives French, Arabic, Spanish, Portuguese, Swahili, Hausa, etc. an actual remote API path out-of-the-box.
    # For Twi/Ewe/Ga, keep local dictionaries or use Google/custom dictionaries because public MT coverage is limited.
    if provider in {"", "auto", "mymemory"} and target_language not in {"tw", "ee", "gaa"}:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    "https://api.mymemory.translated.net/get",
                    params={"q": text[:500], "langpair": f"{source_api_code}|{target_api_code}"},
                )
                response.raise_for_status()
                data = response.json()
                translated = (data.get("responseData") or {}).get("translatedText")
                if translated and translated.strip() and translated.strip().lower() != text.strip().lower():
                    return html.unescape(translated), "mymemory_public_api"
        except Exception:
            pass

    return local_value, "local_fallback"


async def translate_to_user_language(text: str, target_language: str | None) -> str:
    if not text or not target_language or target_language == "en":
        return text
    translated, _ = await translate_with_external_api(text, "en", target_language)
    return translated


async def chatbot_with_api(message: str, language: str = "en") -> tuple[dict, str]:
    """Call a real AI chatbot API when OPENAI_API_KEY is configured.

    The fallback rule-based chatbot remains available so the system still runs in class/demo mode.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    fallback = chatbot_analyze(message)
    if not api_key:
        if language != "en":
            fallback["reply"] = await translate_to_user_language(fallback["reply"], language)
            fallback["next_action"] = await translate_to_user_language(fallback["next_action"], language)
        return fallback, "local_rule_based_fallback"

    system_prompt = (
        "You are ORIGEN ONE GHANA GOLD COAST AI medical assistant for an online telemedicine platform. "
        "You must NOT diagnose or prescribe. Collect symptoms, recommend the correct doctor specialty, "
        "detect emergency red flags, and tell the patient to seek urgent physical care when needed. "
        "Return ONLY valid JSON with keys: reply, risk_level, recommended_specialty, next_action, emergency_flag. "
        "risk_level must be low, moderate, high, or emergency. emergency_flag must be true or false."
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{api_base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Patient language: {language}. Patient message: {message}"},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            parsed = json.loads(content)
            result = {
                "reply": str(parsed.get("reply") or fallback["reply"]),
                "risk_level": str(parsed.get("risk_level") or fallback["risk_level"]).lower(),
                "recommended_specialty": str(parsed.get("recommended_specialty") or fallback["recommended_specialty"]),
                "next_action": str(parsed.get("next_action") or fallback["next_action"]),
                "emergency_flag": bool(parsed.get("emergency_flag", fallback["emergency_flag"])),
            }
            if result["risk_level"] not in {"low", "moderate", "high", "emergency"}:
                result["risk_level"] = fallback["risk_level"]
            if language != "en":
                result["reply"] = await translate_to_user_language(result["reply"], language)
                result["next_action"] = await translate_to_user_language(result["next_action"], language)
            return result, "openai_chat_completions_api"
    except Exception:
        if language != "en":
            fallback["reply"] = await translate_to_user_language(fallback["reply"], language)
            fallback["next_action"] = await translate_to_user_language(fallback["next_action"], language)
        return fallback, "local_rule_based_fallback_after_api_error"


@app.get("/api/localization/ui", response_model=UILanguagePackOut)
def ui_language_pack(language: str = Query(default="en")):
    language = ensure_supported_language(language)
    return UILanguagePackOut(
        language=language,
        direction=language_direction(language),
        provider="backend_ui_pack",
        translations=get_local_ui_pack(language),
    )


@app.post("/api/localization/translate", response_model=TranslationResponse)
async def translate_texts(
    payload: TranslationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source_language = ensure_supported_language(payload.source_language)
    target_language = ensure_supported_language(payload.target_language)

    translations: dict[str, str] = {}
    provider_used = "local"
    for text in payload.texts:
        normalized = (text or "").strip()
        if not normalized:
            translations[text] = ""
            continue
        cached = (
            db.query(TranslationCache)
            .filter(
                TranslationCache.source_language == source_language,
                TranslationCache.target_language == target_language,
                TranslationCache.source_text == normalized,
            )
            .first()
        )
        if cached:
            translations[normalized] = cached.translated_text
            provider_used = cached.provider
            continue

        translated, provider = await translate_with_external_api(normalized, source_language, target_language)
        provider_used = provider
        translations[normalized] = translated
        db.add(
            TranslationCache(
                source_language=source_language,
                target_language=target_language,
                source_text=normalized,
                translated_text=translated,
                provider=provider,
            )
        )

    log_action(db, current_user.id, "translated interface text", "translation", None, details=f"{source_language}->{target_language}; provider={provider_used}")
    db.commit()
    return TranslationResponse(source_language=source_language, target_language=target_language, provider=provider_used, translations=translations)


@app.post("/api/localization/translate-public", response_model=TranslationResponse)
async def translate_texts_public(payload: TranslationRequest, db: Session = Depends(get_db)):
    source_language = ensure_supported_language(payload.source_language)
    target_language = ensure_supported_language(payload.target_language)
    translations: dict[str, str] = {}
    provider_used = "local"
    for text in payload.texts:
        normalized = (text or "").strip()
        if not normalized:
            translations[text] = ""
            continue
        cached = (
            db.query(TranslationCache)
            .filter(
                TranslationCache.source_language == source_language,
                TranslationCache.target_language == target_language,
                TranslationCache.source_text == normalized,
            )
            .first()
        )
        if cached:
            translations[normalized] = cached.translated_text
            provider_used = cached.provider
            continue
        translated, provider = await translate_with_external_api(normalized, source_language, target_language)
        provider_used = provider
        translations[normalized] = translated
        db.add(TranslationCache(
            source_language=source_language,
            target_language=target_language,
            source_text=normalized,
            translated_text=translated,
            provider=provider,
        ))
    db.commit()
    return TranslationResponse(source_language=source_language, target_language=target_language, provider=provider_used, translations=translations)


@app.get("/api/settings/preferences", response_model=UserPreferenceOut)
def get_preferences(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    preference = ensure_preference(db, current_user.id)
    db.commit()
    db.refresh(preference)
    return preference


@app.put("/api/settings/preferences", response_model=UserPreferenceOut)
def update_preferences(
    payload: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preference = ensure_preference(db, current_user.id)
    if payload.language is not None:
        supported_codes = {lang["code"] for lang in SUPPORTED_LANGUAGES}
        if payload.language not in supported_codes:
            raise HTTPException(status_code=400, detail="Unsupported language")
        preference.language = payload.language
    if payload.theme is not None:
        if payload.theme not in {"light", "dark"}:
            raise HTTPException(status_code=400, detail="Theme must be light or dark")
        preference.theme = payload.theme
    if payload.email_notifications is not None:
        preference.email_notifications = payload.email_notifications
    if payload.sms_notifications is not None:
        preference.sms_notifications = payload.sms_notifications
    if payload.reminder_frequency is not None:
        allowed = {"none", "booking_only", "24h_and_1h", "12h_and_1h", "6h_and_30m", "daily_9am_until_due"}
        if payload.reminder_frequency not in allowed:
            raise HTTPException(status_code=400, detail="Unsupported reminder frequency")
        preference.reminder_frequency = payload.reminder_frequency
    log_action(db, current_user.id, "updated interface and notification preferences", "user_preference", preference.id)
    db.commit()
    db.refresh(preference)
    return preference


def chatbot_analyze(message: str):
    text = message.lower()
    emergency_terms = [
        "chest pain", "difficulty breathing", "can't breathe", "cannot breathe",
        "unconscious", "heavy bleeding", "seizure", "convulsion", "stroke",
        "suicide", "poison", "severe allergic", "faint",
    ]
    if any(term in text for term in emergency_terms):
        return {
            "risk_level": "emergency",
            "recommended_specialty": "Emergency Care",
            "next_action": "Seek urgent physical medical care immediately.",
            "emergency_flag": True,
            "reply": "Your symptoms may require urgent physical medical attention. Please go to the nearest emergency unit or call local emergency support immediately. This chatbot is not a final diagnosis.",
        }

    specialty = "General Practitioner"
    risk = "low"
    action = "Book a normal online consultation."

    if any(term in text for term in ["fever", "malaria", "headache", "vomit", "weakness", "cough"]):
        specialty = "General Practitioner"
        risk = "moderate"
        action = "Complete AI screening and book a same-day or next available general consultation."
    if any(term in text for term in ["skin", "rash", "itch", "acne", "eczema"]):
        specialty = "Dermatology"
        risk = "low"
        action = "Book an online dermatology consultation and upload a clear photo if appropriate."
    if any(term in text for term in ["pregnan", "antenatal", "period", "menstrual", "vaginal"]):
        specialty = "Obstetrics and Gynaecology"
        risk = "moderate"
        action = "Book a consultation with an obstetrics/gynaecology doctor."
    if any(term in text for term in ["child", "baby", "infant", "toddler"]):
        specialty = "Paediatrics"
        risk = "moderate"
        action = "Book a paediatric consultation and include the child age and temperature."
    if any(term in text for term in ["eye", "vision", "blurred", "red eye"]):
        specialty = "Ophthalmology"
        risk = "moderate"
        action = "Book an eye-care consultation and upload any previous OCT, VFT, or eye report if available."

    reply = (
        f"Based on what you described, I recommend {specialty}. "
        f"Risk level: {risk}. {action} "
        "This chatbot is not a final diagnosis; a licensed doctor must review your case."
    )
    return {"risk_level": risk, "recommended_specialty": specialty, "next_action": action, "emergency_flag": False, "reply": reply}


@app.post("/api/chatbot/message", response_model=ChatbotResponse)
async def chatbot_message(
    payload: ChatbotMessageCreate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    session = db.get(ChatbotSession, payload.session_id) if payload.session_id else None
    if session and session.patient_id != patient.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if not session:
        session = ChatbotSession(patient_id=patient.id, language=payload.language)
        db.add(session)
        db.flush()

    language = payload.language if payload.language in LANGUAGE_BY_CODE else "en"
    analysis, chatbot_provider = await chatbot_with_api(payload.message, language)
    db.add(ChatbotMessage(session_id=session.id, sender="patient", message=payload.message))
    db.add(
        ChatbotMessage(
            session_id=session.id,
            sender="bot",
            message=analysis["reply"],
            risk_level=analysis["risk_level"],
            recommended_specialty=analysis["recommended_specialty"],
        )
    )
    if analysis["emergency_flag"]:
        create_notification(
            db,
            current_user.id,
            "Emergency Chatbot Warning",
            "The chatbot detected possible emergency symptoms. Seek urgent physical care immediately.",
            "ai_chatbot",
        )
    add_timeline_event(
        db,
        patient.id,
        "ai_chatbot",
        "AI chatbot interaction",
        f"Risk: {analysis['risk_level']}; Recommended: {analysis['recommended_specialty']}; Message: {payload.message[:160]}",
        "chatbot_session",
        session.id,
    )
    log_action(db, current_user.id, "used AI chatbot", "chatbot_session", session.id, details=f"{analysis["recommended_specialty"]}; provider={chatbot_provider}")
    db.commit()
    return ChatbotResponse(
        session_id=session.id,
        reply=analysis["reply"],
        risk_level=analysis["risk_level"],
        recommended_specialty=analysis["recommended_specialty"],
        next_action=analysis["next_action"],
        emergency_flag=analysis["emergency_flag"],
        disclaimer="AI chatbot guidance is not a final medical diagnosis.",
    )


# ----------------------------- Patients -----------------------------

@app.get("/api/patients/profile", response_model=PatientOut)
def get_patient_profile(current_user: User = Depends(require_role(UserRole.patient))):
    return get_patient_or_403(current_user)


@app.put("/api/patients/profile", response_model=PatientOut)
def update_patient_profile(
    payload: PatientUpdate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, key, value)
    add_timeline_event(db, patient.id, "profile", "Profile updated", "Patient updated personal or medical background.", "patient", patient.id)
    log_action(db, current_user.id, "updated patient profile", "patient", patient.id)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/api/patients/timeline", response_model=list[PatientTimelineEventOut])
def patient_timeline(
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    return (
        db.query(PatientTimelineEvent)
        .filter(PatientTimelineEvent.patient_id == patient.id)
        .order_by(PatientTimelineEvent.created_at.desc())
        .limit(200)
        .all()
    )


# ----------------------------- Doctors -----------------------------

@app.get("/api/doctors", response_model=list[DoctorOut])
def list_approved_doctors(
    specialty: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Doctor).options(joinedload(Doctor.user)).filter(
        Doctor.approval_status == DoctorApprovalStatus.approved
    )
    if specialty:
        query = query.filter(Doctor.specialty.ilike(f"%{specialty}%"))
    return query.order_by(Doctor.specialty.asc()).all()


@app.get("/api/doctors/me", response_model=DoctorOut)
def doctor_me(current_user: User = Depends(require_role(UserRole.doctor))):
    return get_doctor_or_403(current_user)


@app.get("/api/doctors/{doctor_id}/availability", response_model=DoctorAvailabilityPublicOut)
def doctor_public_availability(doctor_id: str, db: Session = Depends(get_db)):
    doctor = db.get(Doctor, doctor_id)
    if not doctor or doctor.approval_status != DoctorApprovalStatus.approved:
        raise HTTPException(status_code=404, detail="Doctor not found")
    slots = (
        db.query(DoctorAvailability)
        .filter(DoctorAvailability.doctor_id == doctor_id, DoctorAvailability.is_available.is_(True))
        .order_by(DoctorAvailability.day_of_week.asc(), DoctorAvailability.start_time.asc())
        .all()
    )
    today = datetime.utcnow().strftime("%A")
    today_slots = [slot for slot in slots if slot.day_of_week == today]
    next_available = None
    if slots:
        # Simple display string for the UI. The booking endpoint still performs exact validation.
        first = slots[0]
        next_available = f"{first.day_of_week} {first.start_time.strftime('%H:%M')}–{first.end_time.strftime('%H:%M')}"
    return DoctorAvailabilityPublicOut(
        doctor_id=doctor_id,
        is_available_today=bool(today_slots),
        next_available=next_available,
        slots=slots,
    )


@app.get("/api/doctors/{doctor_id}", response_model=DoctorOut)
def doctor_detail(doctor_id: str, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).options(joinedload(Doctor.user)).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if doctor.approval_status != DoctorApprovalStatus.approved:
        raise HTTPException(status_code=404, detail="Doctor not available")
    return doctor


@app.put("/api/doctors/profile", response_model=DoctorOut)
def update_doctor_profile(
    payload: DoctorUpdate,
    current_user: User = Depends(require_role(UserRole.doctor)),
    db: Session = Depends(get_db),
):
    doctor = get_doctor_or_403(current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(doctor, key, value)
    log_action(db, current_user.id, "updated doctor profile", "doctor", doctor.id)
    db.commit()
    db.refresh(doctor)
    return doctor


@app.post("/api/doctors/availability", response_model=DoctorAvailabilityOut)
def create_availability(
    payload: DoctorAvailabilityCreate,
    current_user: User = Depends(require_role(UserRole.doctor)),
    db: Session = Depends(get_db),
):
    doctor = get_doctor_or_403(current_user)
    availability = DoctorAvailability(doctor_id=doctor.id, **payload.model_dump())
    db.add(availability)
    log_action(db, current_user.id, "created availability", "doctor_availability", availability.id)
    db.commit()
    db.refresh(availability)
    return availability


@app.get("/api/doctors/availability/me", response_model=list[DoctorAvailabilityOut])
def my_availability(
    current_user: User = Depends(require_role(UserRole.doctor)),
    db: Session = Depends(get_db),
):
    doctor = get_doctor_or_403(current_user)
    return db.query(DoctorAvailability).filter(DoctorAvailability.doctor_id == doctor.id).all()


# ----------------------------- AI Screening -----------------------------

@app.post("/api/screenings", response_model=AIScreeningOut)
def create_ai_screening(
    payload: AIScreeningCreate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    if not payload.disclaimer_accepted:
        raise HTTPException(status_code=400, detail="Patient must accept AI screening disclaimer")

    patient = get_patient_or_403(current_user)
    analysis = analyze_screening(
        payload.main_complaint,
        payload.symptoms,
        payload.duration,
        [answer.model_dump() for answer in payload.answers],
    )
    screening = AIScreening(
        patient_id=patient.id,
        main_complaint=payload.main_complaint,
        symptoms=", ".join(payload.symptoms),
        duration=payload.duration,
        risk_level=analysis["risk_level"],
        recommended_specialty=analysis["recommended_specialty"],
        ai_summary=analysis["ai_summary"],
        emergency_flag=analysis["emergency_flag"],
        disclaimer_accepted=payload.disclaimer_accepted,
    )
    db.add(screening)
    db.flush()

    for answer in payload.answers:
        db.add(ScreeningAnswer(screening_id=screening.id, question=answer.question, answer=answer.answer))

    if screening.emergency_flag:
        create_notification(
            db,
            current_user.id,
            "Emergency Warning",
            "Your symptoms may require urgent physical medical care. Please seek help immediately.",
            "ai_screening",
        )

    add_timeline_event(
        db,
        patient.id,
        "ai_screening",
        "AI screening completed",
        f"Complaint: {screening.main_complaint}; Risk: {screening.risk_level.value}; Specialty: {screening.recommended_specialty}",
        "ai_screening",
        screening.id,
    )
    log_action(db, current_user.id, "completed AI screening", "ai_screening", screening.id)
    db.commit()
    db.refresh(screening)
    return screening


@app.get("/api/screenings/me", response_model=list[AIScreeningOut])
def my_screenings(
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    return db.query(AIScreening).filter(AIScreening.patient_id == patient.id).order_by(AIScreening.created_at.desc()).all()


@app.get("/api/screenings/{screening_id}", response_model=AIScreeningOut)
def get_screening(
    screening_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    screening = db.get(AIScreening, screening_id)
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")

    if current_user.role == UserRole.patient and screening.patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        linked = db.query(Appointment).filter(
            Appointment.ai_screening_id == screening.id,
            Appointment.doctor_id == doctor.id,
        ).first()
        if not linked:
            raise HTTPException(status_code=403, detail="Not allowed")
    return screening


@app.post("/api/admin/screening-questions", response_model=ScreeningQuestionOut)
def create_screening_question(
    payload: ScreeningQuestionCreate,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    question = ScreeningQuestion(**payload.model_dump())
    db.add(question)
    log_action(db, current_user.id, "created screening question", "screening_question", question.id)
    db.commit()
    db.refresh(question)
    return question


@app.get("/api/screening-questions", response_model=list[ScreeningQuestionOut])
def list_screening_questions(category: str | None = None, db: Session = Depends(get_db)):
    query = db.query(ScreeningQuestion).filter(ScreeningQuestion.status == "active")
    if category:
        query = query.filter(ScreeningQuestion.complaint_category.ilike(f"%{category}%"))
    return query.all()


# ----------------------------- Appointments -----------------------------

@app.post("/api/appointments", response_model=AppointmentOut)
def book_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    doctor = db.get(Doctor, payload.doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    ensure_approved_doctor(doctor)

    if payload.ai_screening_id:
        screening = db.get(AIScreening, payload.ai_screening_id)
        if not screening or screening.patient_id != patient.id:
            raise HTTPException(status_code=400, detail="Invalid AI screening ID")

    validate_doctor_available_for_appointment(db, doctor.id, payload.appointment_date, payload.appointment_time)

    if not payload.booking_for_self and not payload.patient_display_name:
        raise HTTPException(status_code=400, detail="Provide the family member or other patient name")

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        ai_screening_id=payload.ai_screening_id,
        appointment_date=payload.appointment_date,
        appointment_time=payload.appointment_time,
        consultation_type=payload.consultation_type,
        booking_for_self=payload.booking_for_self,
        patient_display_name=payload.patient_display_name,
        patient_relationship=payload.patient_relationship,
        patient_age=payload.patient_age,
        patient_gender=payload.patient_gender,
        patient_contact=payload.patient_contact,
        patient_notes=payload.patient_notes,
        status=AppointmentStatus.pending_payment,
        payment_status=PaymentStatus.pending,
    )
    db.add(appointment)
    db.flush()
    appointment.consultation_link = generate_consultation_link(appointment.id)
    patient_target = "yourself" if appointment.booking_for_self else f"{appointment.patient_display_name} ({appointment.patient_relationship or 'other'})"
    create_notification(
        db,
        current_user.id,
        "Appointment Created",
        f"Your consultation booking for {patient_target} is pending payment.",
        "appointment",
    )
    create_notification(
        db,
        doctor.user_id,
        "New Consultation Booking",
        f"A patient booked a {appointment.consultation_type.value} consultation for {appointment.appointment_date} at {appointment.appointment_time.strftime('%H:%M')}. Payment is pending.",
        "appointment",
    )
    schedule_appointment_reminders(db, appointment)
    add_timeline_event(
        db,
        patient.id,
        "appointment",
        "Appointment booked",
        f"{appointment.consultation_type.value.title()} consultation booked for {patient_target} on {appointment.appointment_date} {appointment.appointment_time}.",
        "appointment",
        appointment.id,
    )
    log_action(db, current_user.id, "booked appointment pending payment", "appointment", appointment.id)
    db.commit()
    db.refresh(appointment)
    return appointment


@app.get("/api/appointments", response_model=list[AppointmentOut])
def list_appointments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Appointment)
    query = appointment_access_filter(query, current_user)
    return query.order_by(Appointment.created_at.desc()).all()


@app.get("/api/appointments/{appointment_id}", response_model=AppointmentOut)
def appointment_detail(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = appointment_access_filter(db.query(Appointment), current_user)
    appointment = query.filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment




@app.get("/api/appointments/{appointment_id}/clinical-summary")
def appointment_clinical_summary(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = appointment_access_filter(
        db.query(Appointment)
        .options(joinedload(Appointment.patient).joinedload(Patient.user))
        .options(joinedload(Appointment.doctor).joinedload(Doctor.user))
        .options(joinedload(Appointment.ai_screening)),
        current_user,
    ).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    records = db.query(MedicalRecord).filter(MedicalRecord.appointment_id == appointment.id).order_by(MedicalRecord.uploaded_at.desc()).all()
    consultation = db.query(Consultation).filter(Consultation.appointment_id == appointment.id).first()
    prescriptions = []
    if consultation:
        prescriptions = db.query(Prescription).filter(Prescription.consultation_id == consultation.id).all()

    log_action(db, current_user.id, "viewed clinical summary", "appointment", appointment.id)
    db.commit()

    return {
        "appointment": {
            "id": appointment.id,
            "date": str(appointment.appointment_date),
            "time": str(appointment.appointment_time),
            "consultation_type": appointment.consultation_type.value,
            "status": appointment.status.value,
            "payment_status": appointment.payment_status.value,
            "booking_for_self": appointment.booking_for_self,
            "patient_display_name": appointment.patient_display_name,
            "patient_relationship": appointment.patient_relationship,
            "patient_age": appointment.patient_age,
            "patient_gender": appointment.patient_gender,
            "patient_contact": appointment.patient_contact,
            "patient_notes": appointment.patient_notes,
        },
        "patient": {
            "id": appointment.patient.id,
            "name": appointment.patient.user.full_name,
            "gender": appointment.patient.gender,
            "date_of_birth": str(appointment.patient.date_of_birth) if appointment.patient.date_of_birth else None,
            "location": appointment.patient.location,
            "allergies": appointment.patient.allergies,
            "medical_conditions": appointment.patient.medical_conditions,
            "current_medications": appointment.patient.current_medications,
        },
        "doctor": {
            "id": appointment.doctor.id,
            "name": appointment.doctor.user.full_name,
            "specialty": appointment.doctor.specialty,
        },
        "ai_screening": None if not appointment.ai_screening else {
            "id": appointment.ai_screening.id,
            "main_complaint": appointment.ai_screening.main_complaint,
            "symptoms": appointment.ai_screening.symptoms,
            "duration": appointment.ai_screening.duration,
            "risk_level": appointment.ai_screening.risk_level.value,
            "recommended_specialty": appointment.ai_screening.recommended_specialty,
            "ai_summary": appointment.ai_screening.ai_summary,
            "emergency_flag": appointment.ai_screening.emergency_flag,
        },
        "medical_records": [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "file_type": r.file_type,
                "file_url": r.file_url,
                "uploaded_at": r.uploaded_at.isoformat(),
            } for r in records
        ],
        "consultation": None if not consultation else {
            "id": consultation.id,
            "notes": consultation.consultation_notes,
            "diagnosis_summary": consultation.diagnosis_summary,
            "treatment_plan": consultation.treatment_plan,
            "follow_up_required": consultation.follow_up_required,
            "follow_up_date": str(consultation.follow_up_date) if consultation.follow_up_date else None,
        },
        "prescriptions": [
            {
                "id": p.id,
                "issued_at": p.issued_at.isoformat(),
                "note": p.prescription_note,
                "items": [{
                    "drug_name": item.drug_name,
                    "dosage": item.dosage,
                    "frequency": item.frequency,
                    "duration": item.duration,
                    "instructions": item.instructions,
                } for item in p.items],
            } for p in prescriptions
        ],
    }


@app.get("/api/consultation-room/{appointment_id}")
def get_consultation_room(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = appointment_access_filter(db.query(Appointment), current_user).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status not in [AppointmentStatus.confirmed, AppointmentStatus.completed]:
        raise HTTPException(status_code=400, detail="Payment must be completed before joining consultation")

    patient_user = db.get(Patient, appointment.patient_id).user
    doctor = db.get(Doctor, appointment.doctor_id)
    doctor_user = db.get(User, doctor.user_id)

    return {
        "appointment_id": appointment.id,
        "consultation_type": appointment.consultation_type.value,
        "appointment_status": appointment.status.value,
        "payment_status": appointment.payment_status.value,
        "appointment_date": appointment.appointment_date,
        "appointment_time": appointment.appointment_time,
        "patient_name": patient_user.full_name,
        "doctor_name": doctor_user.full_name,
        "current_user_role": current_user.role.value,
        "websocket_path": f"/ws/consultations/{appointment.id}",
    }


class ConsultationConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, appointment_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(appointment_id, []).append(websocket)

    def disconnect(self, appointment_id: str, websocket: WebSocket):
        room = self.rooms.get(appointment_id, [])
        if websocket in room:
            room.remove(websocket)
        if not room and appointment_id in self.rooms:
            del self.rooms[appointment_id]

    async def send_to_room(self, appointment_id: str, message: str, sender: WebSocket | None = None):
        disconnected: list[WebSocket] = []
        for connection in self.rooms.get(appointment_id, []):
            if sender is not None and connection is sender:
                continue
            try:
                await connection.send_text(message)
            except RuntimeError:
                disconnected.append(connection)
        for connection in disconnected:
            self.disconnect(appointment_id, connection)


consultation_manager = ConsultationConnectionManager()


def get_user_from_ws_token(db: Session, token: str) -> User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None
    return db.get(User, user_id)


def user_can_join_appointment(user: User, appointment: Appointment) -> bool:
    if appointment.status not in [AppointmentStatus.confirmed, AppointmentStatus.completed]:
        return False
    if user.role == UserRole.patient and user.patient_profile:
        return appointment.patient_id == user.patient_profile.id
    if user.role == UserRole.doctor and user.doctor_profile:
        return appointment.doctor_id == user.doctor_profile.id
    return False


@app.websocket("/ws/consultations/{appointment_id}")
async def consultation_signaling_websocket(
    websocket: WebSocket,
    appointment_id: str,
    token: str = Query(...),
):
    db = SessionLocal()
    user: User | None = None
    try:
        user = get_user_from_ws_token(db, token)
        appointment = db.get(Appointment, appointment_id)
        if not user or not appointment or not user_can_join_appointment(user, appointment):
            await websocket.close(code=1008)
            return

        await consultation_manager.connect(appointment_id, websocket)
        await websocket.send_text(json.dumps({
            "type": "system",
            "message": "Connected to consultation signaling room.",
            "role": user.role.value,
            "name": user.full_name,
        }))
        await consultation_manager.send_to_room(
            appointment_id,
            json.dumps({"type": "peer-joined", "name": user.full_name, "role": user.role.value}),
            sender=websocket,
        )

        while True:
            message = await websocket.receive_text()
            await consultation_manager.send_to_room(appointment_id, message, sender=websocket)
    except WebSocketDisconnect:
        pass
    finally:
        consultation_manager.disconnect(appointment_id, websocket)
        if user:
            await consultation_manager.send_to_room(
                appointment_id,
                json.dumps({"type": "peer-left", "name": user.full_name, "role": user.role.value}),
            )
        db.close()


@app.put("/api/appointments/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = appointment_access_filter(db.query(Appointment), current_user).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status == AppointmentStatus.completed:
        raise HTTPException(status_code=400, detail="Completed appointment cannot be cancelled")
    appointment.status = AppointmentStatus.cancelled
    log_action(db, current_user.id, "cancelled appointment", "appointment", appointment.id)
    db.commit()
    db.refresh(appointment)
    return appointment


# ----------------------------- Payments -----------------------------

@app.post("/api/payments/pay", response_model=PaymentOut)
def pay_for_appointment(
    payload: PaymentCreate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    appointment = db.get(Appointment, payload.appointment_id)
    if not appointment or appointment.patient_id != patient.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status != AppointmentStatus.pending_payment:
        raise HTTPException(status_code=400, detail="Appointment is not pending payment")

    doctor = db.get(Doctor, appointment.doctor_id)
    amount = doctor.consultation_fee
    reference = f"MOCK-{uuid.uuid4().hex[:14].upper()}"

    payment = Payment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        appointment_id=appointment.id,
        amount=amount,
        payment_method=payload.payment_method,
        transaction_reference=reference,
        status=PaymentStatus.successful,
        paid_at=datetime.utcnow(),
    )
    appointment.payment_status = PaymentStatus.successful
    appointment.status = AppointmentStatus.confirmed
    db.add(payment)

    create_notification(
        db,
        current_user.id,
        "Payment Successful",
        "Your consultation payment was successful and your appointment is confirmed.",
        "payment",
    )
    create_notification(
        db,
        doctor.user_id,
        "New Confirmed Appointment",
        "A patient has booked and paid for a consultation.",
        "appointment",
    )
    add_timeline_event(
        db,
        patient.id,
        "payment",
        "Payment completed",
        f"GHS {payment.amount:.2f} paid through {payment.payment_method}. Reference: {payment.transaction_reference}",
        "payment",
        payment.id,
    )
    log_action(db, current_user.id, "paid for appointment", "payment", payment.id)
    db.commit()
    db.refresh(payment)
    return payment


@app.get("/api/payments/history", response_model=list[PaymentOut])
def payment_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Payment)
    if current_user.role == UserRole.patient:
        patient = get_patient_or_403(current_user)
        query = query.filter(Payment.patient_id == patient.id)
    elif current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        query = query.filter(Payment.doctor_id == doctor.id)
    return query.order_by(Payment.created_at.desc()).all()


# ----------------------------- Medical Records -----------------------------

@app.post("/api/medical-records/upload", response_model=MedicalRecordOut)
def upload_medical_record(
    title: str = Form(...),
    description: str | None = Form(None),
    appointment_id: str | None = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
    original_name = file.filename or "record"
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Allowed file types: PDF, JPG, JPEG, PNG, DOCX")

    if appointment_id:
        appointment = db.get(Appointment, appointment_id)
        if not appointment or appointment.patient_id != patient.id:
            raise HTTPException(status_code=400, detail="Invalid appointment ID")

    safe_name = f"{uuid.uuid4().hex}{extension}"
    path = UPLOAD_DIR / safe_name
    with open(path, "wb") as f:
        f.write(file.file.read())

    record = MedicalRecord(
        patient_id=patient.id,
        appointment_id=appointment_id,
        title=title,
        description=description,
        file_url=f"/uploads/{safe_name}",
        file_type=extension.replace(".", ""),
    )
    db.add(record)
    add_timeline_event(
        db,
        patient.id,
        "medical_record",
        "Medical record uploaded",
        f"{record.title} uploaded for doctor review.",
        "medical_record",
        record.id,
    )
    log_action(db, current_user.id, "uploaded medical record", "medical_record", record.id)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/medical-records", response_model=list[MedicalRecordOut])
def list_medical_records(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == UserRole.patient:
        patient = get_patient_or_403(current_user)
        return db.query(MedicalRecord).filter(MedicalRecord.patient_id == patient.id).order_by(MedicalRecord.uploaded_at.desc()).all()

    if current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        appointment_ids = [row[0] for row in db.query(Appointment.id).filter(Appointment.doctor_id == doctor.id).all()]
        if not appointment_ids:
            return []
        return db.query(MedicalRecord).filter(MedicalRecord.appointment_id.in_(appointment_ids)).order_by(MedicalRecord.uploaded_at.desc()).all()

    return db.query(MedicalRecord).order_by(MedicalRecord.uploaded_at.desc()).all()


# ----------------------------- Consultations -----------------------------

@app.post("/api/consultations", response_model=ConsultationOut)
def create_consultation(
    payload: ConsultationCreate,
    current_user: User = Depends(require_role(UserRole.doctor)),
    db: Session = Depends(get_db),
):
    doctor = get_doctor_or_403(current_user)
    ensure_approved_doctor(doctor)
    appointment = db.get(Appointment, payload.appointment_id)
    if not appointment or appointment.doctor_id != doctor.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status not in [AppointmentStatus.confirmed, AppointmentStatus.completed]:
        raise HTTPException(status_code=400, detail="Only confirmed appointments can be consulted")

    existing = db.query(Consultation).filter(Consultation.appointment_id == appointment.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Consultation already exists for this appointment")

    consultation = Consultation(
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=doctor.id,
        consultation_notes=payload.consultation_notes,
        diagnosis_summary=payload.diagnosis_summary,
        treatment_plan=payload.treatment_plan,
        follow_up_required=payload.follow_up_required,
        follow_up_date=payload.follow_up_date,
        completed_at=datetime.utcnow() if payload.complete_now else None,
    )
    if payload.complete_now:
        appointment.status = AppointmentStatus.completed

    db.add(consultation)
    create_notification(
        db,
        appointment.patient.user_id,
        "Consultation Completed",
        "Your doctor has completed the consultation notes.",
        "consultation",
    )
    add_timeline_event(
        db,
        appointment.patient_id,
        "consultation",
        "Consultation completed",
        consultation.diagnosis_summary or consultation.consultation_notes[:180],
        "consultation",
        consultation.id,
    )
    log_action(db, current_user.id, "created consultation", "consultation", consultation.id)
    db.commit()
    db.refresh(consultation)
    return consultation


@app.get("/api/consultations/history", response_model=list[ConsultationOut])
def consultation_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Consultation)
    if current_user.role == UserRole.patient:
        patient = get_patient_or_403(current_user)
        query = query.filter(Consultation.patient_id == patient.id)
    elif current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        query = query.filter(Consultation.doctor_id == doctor.id)
    return query.order_by(Consultation.created_at.desc()).all()


# ----------------------------- Prescriptions -----------------------------

@app.post("/api/prescriptions", response_model=PrescriptionOut)
def create_prescription(
    payload: PrescriptionCreate,
    current_user: User = Depends(require_role(UserRole.doctor)),
    db: Session = Depends(get_db),
):
    doctor = get_doctor_or_403(current_user)
    consultation = db.get(Consultation, payload.consultation_id)
    if not consultation or consultation.doctor_id != doctor.id:
        raise HTTPException(status_code=404, detail="Consultation not found")

    prescription = Prescription(
        consultation_id=consultation.id,
        patient_id=consultation.patient_id,
        doctor_id=doctor.id,
        prescription_note=payload.prescription_note,
        digital_signature=f"Signed electronically by {current_user.full_name}",
    )
    db.add(prescription)
    db.flush()

    for item in payload.items:
        db.add(PrescriptionItem(prescription_id=prescription.id, **item.model_dump()))

    patient_user_id = db.get(Patient, consultation.patient_id).user_id
    create_notification(
        db,
        patient_user_id,
        "Prescription Issued",
        "Your doctor has issued a new prescription.",
        "prescription",
    )
    add_timeline_event(
        db,
        consultation.patient_id,
        "prescription",
        "Prescription issued",
        f"Prescription created with {len(payload.items)} medication item(s).",
        "prescription",
        prescription.id,
    )
    log_action(db, current_user.id, "created prescription", "prescription", prescription.id)
    db.commit()
    db.refresh(prescription)
    return prescription


@app.get("/api/prescriptions", response_model=list[PrescriptionOut])
def list_prescriptions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Prescription)
    if current_user.role == UserRole.patient:
        patient = get_patient_or_403(current_user)
        query = query.filter(Prescription.patient_id == patient.id)
    elif current_user.role == UserRole.doctor:
        doctor = get_doctor_or_403(current_user)
        query = query.filter(Prescription.doctor_id == doctor.id)
    return query.order_by(Prescription.issued_at.desc()).all()


@app.get("/api/prescriptions/{prescription_id}", response_model=PrescriptionOut)
def prescription_detail(prescription_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prescription = db.get(Prescription, prescription_id)
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
    if current_user.role == UserRole.patient and prescription.patient_id != get_patient_or_403(current_user).id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if current_user.role == UserRole.doctor and prescription.doctor_id != get_doctor_or_403(current_user).id:
        raise HTTPException(status_code=403, detail="Not allowed")
    return prescription


# ----------------------------- Reviews and Complaints -----------------------------

@app.post("/api/reviews", response_model=ReviewOut)
def create_review(
    payload: ReviewCreate,
    current_user: User = Depends(require_role(UserRole.patient)),
    db: Session = Depends(get_db),
):
    patient = get_patient_or_403(current_user)
    appointment = db.get(Appointment, payload.appointment_id)
    if not appointment or appointment.patient_id != patient.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status != AppointmentStatus.completed:
        raise HTTPException(status_code=400, detail="Only completed consultations can be reviewed")

    review = Review(
        patient_id=patient.id,
        doctor_id=appointment.doctor_id,
        appointment_id=appointment.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    log_action(db, current_user.id, "created review", "review", review.id)
    db.commit()
    db.refresh(review)
    return review


@app.post("/api/complaints", response_model=ComplaintOut)
def create_complaint(
    payload: ComplaintCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    complaint = Complaint(
        submitted_by=current_user.id,
        appointment_id=payload.appointment_id,
        category=payload.category,
        description=payload.description,
    )
    db.add(complaint)
    log_action(db, current_user.id, "created complaint", "complaint", complaint.id)
    db.commit()
    db.refresh(complaint)
    return complaint


@app.get("/api/complaints", response_model=list[ComplaintOut])
def list_complaints(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Complaint)
    if current_user.role != UserRole.admin:
        query = query.filter(Complaint.submitted_by == current_user.id)
    return query.order_by(Complaint.created_at.desc()).all()


# ----------------------------- Notifications -----------------------------

@app.get("/api/notifications")
def my_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Demo convenience: process due reminders for the currently logged-in user when they open notifications.
    process_due_reminders(db, current_user.id)
    db.commit()
    return db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()


@app.get("/api/notifications/deliveries", response_model=list[NotificationDeliveryOut])
def my_notification_deliveries(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(NotificationDelivery)
    if current_user.role != UserRole.admin:
        query = query.filter(NotificationDelivery.user_id == current_user.id)
    return query.order_by(NotificationDelivery.created_at.desc()).limit(200).all()


@app.get("/api/notifications/reminders", response_model=list[ReminderScheduleOut])
def my_reminder_schedules(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(ReminderSchedule)
    if current_user.role != UserRole.admin:
        query = query.filter(ReminderSchedule.user_id == current_user.id)
    return query.order_by(ReminderSchedule.remind_at.asc()).limit(200).all()


@app.post("/api/notifications/process-reminders")
def process_reminders_now(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # In production this should be called by a scheduler/cron job. For the demo, users/admins can trigger it manually.
    sent_count = process_due_reminders(db, None if current_user.role == UserRole.admin else current_user.id)
    db.commit()
    return {"processed": sent_count}


# ----------------------------- Admin -----------------------------

@app.get("/api/admin/dashboard", response_model=DashboardStats)
def admin_dashboard(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    total_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.status == PaymentStatus.successful).scalar()
    return DashboardStats(
        total_patients=db.query(Patient).count(),
        total_doctors=db.query(Doctor).count(),
        pending_doctor_approvals=db.query(Doctor).filter(Doctor.approval_status == DoctorApprovalStatus.pending).count(),
        total_appointments=db.query(Appointment).count(),
        confirmed_appointments=db.query(Appointment).filter(Appointment.status == AppointmentStatus.confirmed).count(),
        completed_appointments=db.query(Appointment).filter(Appointment.status == AppointmentStatus.completed).count(),
        total_payments=db.query(Payment).count(),
        successful_payments=db.query(Payment).filter(Payment.status == PaymentStatus.successful).count(),
        total_revenue=float(total_revenue or 0),
        emergency_screenings=db.query(AIScreening).filter(AIScreening.emergency_flag.is_(True)).count(),
        open_complaints=db.query(Complaint).filter(Complaint.status == ComplaintStatus.open).count(),
    )


@app.get("/api/admin/doctors/pending", response_model=list[DoctorOut])
def pending_doctors(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    return db.query(Doctor).options(joinedload(Doctor.user)).filter(Doctor.approval_status == DoctorApprovalStatus.pending).all()


@app.put("/api/admin/doctors/{doctor_id}/approve", response_model=DoctorOut)
def approve_doctor(
    doctor_id: str,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.approval_status = DoctorApprovalStatus.approved
    create_notification(db, doctor.user_id, "Doctor Account Approved", "Your doctor account is now active.", "doctor_approval")
    log_action(db, current_user.id, "approved doctor", "doctor", doctor.id)
    db.commit()
    db.refresh(doctor)
    return doctor


@app.put("/api/admin/doctors/{doctor_id}/reject", response_model=DoctorOut)
def reject_doctor(
    doctor_id: str,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.approval_status = DoctorApprovalStatus.rejected
    create_notification(db, doctor.user_id, "Doctor Account Rejected", "Your doctor account was not approved.", "doctor_approval")
    log_action(db, current_user.id, "rejected doctor", "doctor", doctor.id)
    db.commit()
    db.refresh(doctor)
    return doctor



@app.post("/api/admin/create-user", response_model=UserOut)
def admin_create_user(
    payload: RegisterRequest,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    if payload.role == UserRole.admin:
        raise HTTPException(status_code=403, detail="This endpoint creates patients or doctors only")
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    ensure_preference(db, user.id)

    if payload.role == UserRole.patient:
        patient = Patient(
            user_id=user.id,
            gender=payload.gender,
            date_of_birth=payload.date_of_birth,
            location=payload.location,
            emergency_contact=payload.emergency_contact,
        )
        db.add(patient)
        db.flush()
        add_timeline_event(db, patient.id, "registration", "Account created by administrator", "Admin-created patient account.", "patient", patient.id)
        create_notification(db, user.id, "Account Created", "Your patient account has been created by the platform administrator.", "account", force_email=bool(user.email), force_sms=bool(user.phone))
    elif payload.role == UserRole.doctor:
        if not payload.license_number or not payload.specialty:
            raise HTTPException(status_code=400, detail="Doctors must provide license_number and specialty")
        doctor = Doctor(
            user_id=user.id,
            license_number=payload.license_number,
            specialty=payload.specialty,
            qualification=payload.qualification,
            experience_years=payload.experience_years,
            languages=payload.languages,
            consultation_fee=payload.consultation_fee,
            bio=payload.bio,
            approval_status=DoctorApprovalStatus.approved,
        )
        db.add(doctor)
        create_notification(db, user.id, "Doctor Account Created", "Your doctor account has been created and approved by the administrator.", "account", force_email=bool(user.email), force_sms=bool(user.phone))

    log_action(db, current_user.id, f"admin created {payload.role.value}", "user", user.id, details=f"Created user {payload.email}")
    db.commit()
    db.refresh(user)
    return user


@app.put("/api/admin/complaints/{complaint_id}/resolve", response_model=ComplaintOut)
def admin_resolve_complaint(
    complaint_id: str,
    admin_response: str = Form("Resolved by administrator."),
    current_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint.status = ComplaintStatus.resolved
    complaint.admin_response = admin_response
    create_notification(db, complaint.submitted_by, "Complaint Resolved", admin_response, "complaint")
    log_action(db, current_user.id, "resolved complaint", "complaint", complaint.id, details=admin_response)
    db.commit()
    db.refresh(complaint)
    return complaint


@app.get("/api/admin/users", response_model=list[UserOut])
def admin_users(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()


@app.get("/api/admin/payments", response_model=list[PaymentOut])
def admin_payments(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    return db.query(Payment).order_by(Payment.created_at.desc()).all()


@app.get("/api/admin/audit-logs", response_model=list[AuditLogOut])
def audit_logs(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()


@app.get("/api/admin/analytics", response_model=AnalyticsOut)
def admin_analytics(current_user: User = Depends(require_role(UserRole.admin)), db: Session = Depends(get_db)):
    def pairs(query):
        return {getattr(k, "value", str(k)): int(v) for k, v in query.all()}

    appointments_by_status = pairs(db.query(Appointment.status, func.count(Appointment.id)).group_by(Appointment.status))
    payments_by_status = pairs(db.query(Payment.status, func.count(Payment.id)).group_by(Payment.status))
    ai_risk_distribution = pairs(db.query(AIScreening.risk_level, func.count(AIScreening.id)).group_by(AIScreening.risk_level))

    revenue_rows = (
        db.query(func.strftime("%Y-%m", Payment.paid_at), func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.status == PaymentStatus.successful)
        .group_by(func.strftime("%Y-%m", Payment.paid_at))
        .order_by(func.strftime("%Y-%m", Payment.paid_at))
        .all()
    )
    revenue_by_month = {str(month or "unknown"): float(total or 0) for month, total in revenue_rows}

    workload_rows = (
        db.query(User.full_name, func.count(Appointment.id))
        .join(Doctor, Doctor.user_id == User.id)
        .join(Appointment, Appointment.doctor_id == Doctor.id, isouter=True)
        .group_by(User.full_name)
        .all()
    )
    consultations_by_doctor = {name: int(count) for name, count in workload_rows}

    language_rows = db.query(UserPreference.language, func.count(UserPreference.id)).group_by(UserPreference.language).all()
    language_distribution = {str(lang): int(count) for lang, count in language_rows}

    total_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.status == PaymentStatus.successful).scalar()
    totals = {
        "patients": db.query(Patient).count(),
        "doctors": db.query(Doctor).count(),
        "appointments": db.query(Appointment).count(),
        "payments": db.query(Payment).count(),
        "revenue": float(total_revenue or 0),
        "screenings": db.query(AIScreening).count(),
        "complaints": db.query(Complaint).count(),
    }

    return AnalyticsOut(
        totals=totals,
        appointments_by_status=appointments_by_status,
        payments_by_status=payments_by_status,
        revenue_by_month=revenue_by_month,
        ai_risk_distribution=ai_risk_distribution,
        consultations_by_doctor=consultations_by_doctor,
        language_distribution=language_distribution,
        recent_activity_count=db.query(AuditLog).count(),
    )


@app.get("/")
def root():
    return {
        "system": "ORIGEN ONE GHANA — GOLD COAST Telemedicine System",
        "docs": "/docs",
        "frontend": "/static/index.html",
    }
