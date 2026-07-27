from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from .models import AppointmentStatus, ConsultationType, DoctorApprovalStatus, PaymentStatus, RiskLevel, UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None


class RegisterRequest(UserBase):
    password: str = Field(min_length=8)
    role: UserRole
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    location: Optional[str] = None
    emergency_contact: Optional[str] = None
    license_number: Optional[str] = None
    specialty: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: int = 0
    languages: Optional[str] = None
    consultation_fee: float = 0
    bio: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(UserBase):
    id: str
    role: UserRole
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdateAdmin(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[str] = None
    new_password: Optional[str] = None



class PatientOut(BaseModel):
    id: str
    user_id: str
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    location: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    current_medications: Optional[str] = None

    class Config:
        from_attributes = True


class PatientUpdate(BaseModel):
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    location: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    current_medications: Optional[str] = None


class DoctorOut(BaseModel):
    id: str
    user_id: str
    license_number: str
    specialty: str
    qualification: Optional[str] = None
    experience_years: int
    languages: Optional[str] = None
    consultation_fee: float
    profile_photo: Optional[str] = None
    approval_status: DoctorApprovalStatus
    bio: Optional[str] = None
    user: Optional[UserOut] = None

    class Config:
        from_attributes = True


class DoctorUpdate(BaseModel):
    specialty: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    languages: Optional[str] = None
    consultation_fee: Optional[float] = None
    profile_photo: Optional[str] = None
    bio: Optional[str] = None


class DoctorAvailabilityCreate(BaseModel):
    day_of_week: str
    start_time: time
    end_time: time
    is_available: bool = True


class DoctorAvailabilityOut(DoctorAvailabilityCreate):
    id: str
    doctor_id: str

    class Config:
        from_attributes = True


class ScreeningAnswerIn(BaseModel):
    question: str
    answer: str


class AIScreeningCreate(BaseModel):
    main_complaint: str
    symptoms: list[str]
    duration: Optional[str] = None
    answers: list[ScreeningAnswerIn] = []
    disclaimer_accepted: bool = True


class AIScreeningOut(BaseModel):
    id: str
    patient_id: str
    main_complaint: str
    symptoms: str
    duration: Optional[str] = None
    risk_level: RiskLevel
    recommended_specialty: str
    ai_summary: str
    emergency_flag: bool
    disclaimer_accepted: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ScreeningQuestionCreate(BaseModel):
    complaint_category: str
    question_text: str
    question_type: str = "yes_no"
    is_emergency_question: bool = False
    status: str = "active"


class ScreeningQuestionOut(ScreeningQuestionCreate):
    id: str

    class Config:
        from_attributes = True


class AppointmentCreate(BaseModel):
    doctor_id: str
    ai_screening_id: Optional[str] = None
    appointment_date: date
    appointment_time: time
    consultation_type: ConsultationType = ConsultationType.video
    booking_for_self: bool = True
    patient_display_name: Optional[str] = None
    patient_relationship: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    patient_contact: Optional[str] = None
    patient_notes: Optional[str] = None


class AppointmentOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    ai_screening_id: Optional[str] = None
    appointment_date: date
    appointment_time: time
    consultation_type: ConsultationType
    status: AppointmentStatus
    payment_status: PaymentStatus
    consultation_link: Optional[str] = None
    booking_for_self: bool = True
    patient_display_name: Optional[str] = None
    patient_relationship: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    patient_contact: Optional[str] = None
    patient_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    appointment_id: str
    payment_method: str = "mock_mobile_money"


class PaymentOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    appointment_id: str
    amount: float
    payment_method: str
    transaction_reference: str
    status: PaymentStatus
    paid_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConsultationCreate(BaseModel):
    appointment_id: str
    consultation_notes: str
    diagnosis_summary: Optional[str] = None
    treatment_plan: Optional[str] = None
    follow_up_required: bool = False
    follow_up_date: Optional[date] = None
    complete_now: bool = True


class ConsultationOut(BaseModel):
    id: str
    appointment_id: str
    patient_id: str
    doctor_id: str
    consultation_notes: str
    diagnosis_summary: Optional[str] = None
    treatment_plan: Optional[str] = None
    follow_up_required: bool
    follow_up_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PrescriptionItemCreate(BaseModel):
    drug_name: str
    dosage: str
    frequency: str
    duration: str
    instructions: Optional[str] = None
    warning: Optional[str] = None


class PrescriptionCreate(BaseModel):
    consultation_id: str
    prescription_note: Optional[str] = None
    items: list[PrescriptionItemCreate]


class PrescriptionItemOut(PrescriptionItemCreate):
    id: str
    prescription_id: str

    class Config:
        from_attributes = True


class PrescriptionOut(BaseModel):
    id: str
    consultation_id: str
    patient_id: str
    doctor_id: str
    prescription_note: Optional[str] = None
    issued_at: datetime
    digital_signature: Optional[str] = None
    items: list[PrescriptionItemOut] = []

    class Config:
        from_attributes = True


class MedicalRecordOut(BaseModel):
    id: str
    patient_id: str
    appointment_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    file_url: str
    file_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    appointment_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class ReviewOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    appointment_id: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ComplaintCreate(BaseModel):
    appointment_id: Optional[str] = None
    category: str
    description: str


class ComplaintOut(BaseModel):
    id: str
    submitted_by: str
    appointment_id: Optional[str] = None
    category: str
    description: str
    status: str
    admin_response: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_patients: int
    total_doctors: int
    pending_doctor_approvals: int
    total_appointments: int
    confirmed_appointments: int
    completed_appointments: int
    total_payments: int
    successful_payments: int
    total_revenue: float
    emergency_screenings: int
    open_complaints: int


class UserPreferenceUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    reminder_frequency: Optional[str] = None


class UserPreferenceOut(BaseModel):
    id: str
    user_id: str
    language: str
    theme: str
    email_notifications: bool = True
    sms_notifications: bool = True
    reminder_frequency: str = "24h_and_1h"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True




class TranslationRequest(BaseModel):
    texts: list[str] = Field(min_length=1)
    target_language: str = Field(default="en")
    source_language: str = Field(default="en")


class TranslationResponse(BaseModel):
    source_language: str
    target_language: str
    provider: str
    translations: dict[str, str]


class UILanguagePackOut(BaseModel):
    language: str
    direction: str
    provider: str
    translations: dict[str, str]


class ChatbotMessageCreate(BaseModel):
    message: str
    session_id: Optional[str] = None
    language: str = "en"


class ChatbotResponse(BaseModel):
    session_id: str
    reply: str
    risk_level: str
    recommended_specialty: str
    next_action: str
    emergency_flag: bool
    disclaimer: str


class ChatbotHistoryItem(BaseModel):
    id: str
    sender: str
    message: str
    risk_level: Optional[str] = None
    recommended_specialty: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatbotHistoryOut(BaseModel):
    session_id: str
    messages: list[ChatbotHistoryItem]



class PatientTimelineEventOut(BaseModel):
    id: str
    patient_id: str
    event_type: str
    title: str
    description: Optional[str] = None
    related_entity: Optional[str] = None
    related_entity_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity: Optional[str] = None
    entity_id: Optional[str] = None
    outcome: str
    ip_address: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True



class NotificationDeliveryOut(BaseModel):
    id: str
    notification_id: Optional[str] = None
    user_id: str
    channel: str
    recipient: str
    subject: str
    message: str
    status: str
    provider_response: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReminderScheduleOut(BaseModel):
    id: str
    appointment_id: str
    user_id: str
    channel: str
    remind_at: datetime
    status: str
    message: str
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DoctorAvailabilityPublicOut(BaseModel):
    doctor_id: str
    is_available_today: bool
    next_available: Optional[str] = None
    slots: list[DoctorAvailabilityOut]


class AnalyticsOut(BaseModel):
    totals: dict
    appointments_by_status: dict
    payments_by_status: dict
    revenue_by_month: dict
    ai_risk_distribution: dict
    consultations_by_doctor: dict
    language_distribution: dict
    recent_activity_count: int
