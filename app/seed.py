from datetime import date, time

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import (
    Doctor,
    DoctorApprovalStatus,
    DoctorAvailability,
    Patient,
    PatientTimelineEvent,
    AuditLog,
    ScreeningQuestion,
    User,
    UserPreference,
    UserRole,
)


def get_or_create_user(db, full_name, email, phone, password, role):
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        full_name=full_name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = get_or_create_user(
            db,
            full_name="System Administrator",
            email="admin@telemedapp.com",
            phone="0000000000",
            password="Admin@12345",
            role=UserRole.admin,
        )

        patient_user = get_or_create_user(
            db,
            full_name="Demo Patient",
            email="patient@telemedapp.com",
            phone="0240000001",
            password="Patient@12345",
            role=UserRole.patient,
        )
        patient = db.query(Patient).filter(Patient.user_id == patient_user.id).first()
        if not patient:
            patient = Patient(
                user_id=patient_user.id,
                gender="Female",
                date_of_birth=date(1995, 1, 1),
                location="Accra",
                emergency_contact="0200000000",
                allergies="None known",
                medical_conditions="None reported",
            )
            db.add(patient)
            db.flush()

        if not db.query(PatientTimelineEvent).filter(PatientTimelineEvent.patient_id == patient.id).first():
            db.add(
                PatientTimelineEvent(
                    patient_id=patient.id,
                    event_type="registration",
                    title="Demo account created",
                    description="Seeded patient account is ready for testing appointments, screening, payments, records, and prescriptions.",
                    related_entity="patient",
                    related_entity_id=patient.id,
                )
            )

        doctor_user = get_or_create_user(
            db,
            full_name="Dr. Ama Mensah",
            email="doctor@telemedapp.com",
            phone="0240000002",
            password="Doctor@12345",
            role=UserRole.doctor,
        )
        doctor = db.query(Doctor).filter(Doctor.user_id == doctor_user.id).first()
        if not doctor:
            doctor = Doctor(
                user_id=doctor_user.id,
                license_number="MDC-DEMO-001",
                specialty="General Practitioner",
                qualification="MBChB",
                experience_years=8,
                languages="English, Twi",
                consultation_fee=120.0,
                approval_status=DoctorApprovalStatus.approved,
                bio="Experienced general practitioner providing online medical consultations.",
            )
            db.add(doctor)
            db.flush()
            db.add_all(
                [
                    DoctorAvailability(doctor_id=doctor.id, day_of_week="Monday", start_time=time(9, 0), end_time=time(14, 0)),
                    DoctorAvailability(doctor_id=doctor.id, day_of_week="Wednesday", start_time=time(10, 0), end_time=time(16, 0)),
                    DoctorAvailability(doctor_id=doctor.id, day_of_week="Friday", start_time=time(8, 0), end_time=time(12, 0)),
                ]
            )

        for user in [admin, patient_user, doctor_user]:
            if not db.query(UserPreference).filter(UserPreference.user_id == user.id).first():
                db.add(UserPreference(user_id=user.id, language="en", theme="light"))

        if not db.query(AuditLog).first():
            db.add(AuditLog(user_id=admin.id, user_name=admin.full_name, user_role=admin.role.value, action="seeded demo database", entity="system", outcome="success", details="Demo users, doctor profile, screening questions, preferences, and initial timeline were created."))

        questions = [
            ("fever", "How many days have you had the fever?", "text", False),
            ("fever", "Do you have chills or body weakness?", "yes_no", False),
            ("fever", "Do you have difficulty breathing?", "yes_no", True),
            ("chest pain", "Does the chest pain spread to your arm, jaw, back, or shoulder?", "yes_no", True),
            ("chest pain", "Are you sweating heavily or feeling faint?", "yes_no", True),
            ("general", "Have you taken any medication for this problem?", "text", False),
            ("general", "Do you have any known allergies?", "text", False),
        ]
        for category, text, qtype, emergency in questions:
            exists = db.query(ScreeningQuestion).filter(
                ScreeningQuestion.complaint_category == category,
                ScreeningQuestion.question_text == text,
            ).first()
            if not exists:
                db.add(
                    ScreeningQuestion(
                        complaint_category=category,
                        question_text=text,
                        question_type=qtype,
                        is_emergency_question=emergency,
                    )
                )

        db.commit()
        print("Database seeded successfully.")
        print("Admin: admin@telemedapp.com / Admin@12345")
        print("Doctor: doctor@telemedapp.com / Doctor@12345")
        print("Patient: patient@telemedapp.com / Patient@12345")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
