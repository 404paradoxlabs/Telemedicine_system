from .models import RiskLevel

EMERGENCY_KEYWORDS = {
    "severe chest pain",
    "chest pain",
    "difficulty breathing",
    "shortness of breath",
    "unconscious",
    "loss of consciousness",
    "heavy bleeding",
    "stroke",
    "seizure",
    "poisoning",
    "suicidal",
    "severe allergic reaction",
    "pregnancy bleeding",
}

HIGH_RISK_KEYWORDS = {
    "high fever",
    "persistent vomiting",
    "severe abdominal pain",
    "dehydration",
    "confusion",
    "severe headache",
    "blood in stool",
    "blood in urine",
}

SPECIALTY_MAP = {
    "skin": "Dermatologist",
    "rash": "Dermatologist",
    "child": "Pediatrician",
    "pregnancy": "Obstetrician/Gynecologist",
    "eye": "Ophthalmologist",
    "tooth": "Dentist",
    "dental": "Dentist",
    "heart": "Cardiologist",
    "chest pain": "Cardiologist",
    "mental": "Mental Health Specialist",
    "anxiety": "Mental Health Specialist",
    "depression": "Mental Health Specialist",
    "fever": "General Practitioner",
    "cough": "General Practitioner",
    "headache": "General Practitioner",
}


def analyze_screening(main_complaint: str, symptoms: list[str], duration: str | None, answers: list[dict]) -> dict:
    all_text = " ".join([main_complaint, duration or "", *symptoms])
    for answer in answers:
        all_text += f" {answer.get('question', '')} {answer.get('answer', '')}"
    normalized = all_text.lower()

    emergency_hits = sorted([word for word in EMERGENCY_KEYWORDS if word in normalized])
    high_hits = sorted([word for word in HIGH_RISK_KEYWORDS if word in normalized])

    duration_days = _infer_duration_days(duration or "")

    if emergency_hits:
        risk_level = RiskLevel.emergency
        emergency_flag = True
    elif high_hits or duration_days >= 7:
        risk_level = RiskLevel.high
        emergency_flag = False
    elif duration_days >= 3 or len(symptoms) >= 3:
        risk_level = RiskLevel.moderate
        emergency_flag = False
    else:
        risk_level = RiskLevel.low
        emergency_flag = False

    specialty = "General Practitioner"
    for keyword, mapped_specialty in SPECIALTY_MAP.items():
        if keyword in normalized:
            specialty = mapped_specialty
            break

    symptoms_text = ", ".join(symptoms)
    if emergency_flag:
        action = (
            "You reported symptoms that may need urgent physical medical care. "
            "Please go to the nearest clinic, hospital, or emergency unit immediately."
        )
    elif risk_level == RiskLevel.high:
        action = "You should book an early doctor review as soon as possible."
    elif risk_level == RiskLevel.moderate:
        action = "You should book a timely online consultation for a doctor to review your symptoms."
    else:
        action = "You can proceed with normal online consultation booking."

    ai_summary = (
        f"You selected '{main_complaint}' as your main complaint. "
        f"You reported these symptoms: {symptoms_text or 'none specified'}. "
        f"You said the duration is: {duration or 'not specified'}. "
        f"Your preliminary risk level is: {risk_level.value}. "
        f"The recommended specialty for you is: {specialty}. {action} "
        "This screening is not a final diagnosis. A licensed doctor must review your case before any treatment decision is made."
    )

    return {
        "risk_level": risk_level,
        "recommended_specialty": specialty,
        "ai_summary": ai_summary,
        "emergency_flag": emergency_flag,
    }


def _infer_duration_days(duration: str) -> int:
    text = duration.lower()
    numbers = [int(token) for token in text.replace("-", " ").split() if token.isdigit()]
    value = numbers[0] if numbers else 0
    if "week" in text:
        return value * 7 if value else 7
    if "month" in text:
        return value * 30 if value else 30
    if "day" in text:
        return value if value else 1
    return value
