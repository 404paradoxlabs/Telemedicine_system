const API = window.location.origin;
let token = localStorage.getItem("telemed_token") || "";

function show(id, data) {
  document.getElementById(id).textContent = JSON.stringify(data, null, 2);
}

async function request(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

async function login() {
  try {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value,
      }),
    });
    token = data.access_token;
    localStorage.setItem("telemed_token", token);
    show("loginResult", data);
  } catch (err) {
    show("loginResult", err);
  }
}

async function listDoctors() {
  try {
    const data = await request("/api/doctors");
    show("doctorResult", data);
    if (data[0]) document.getElementById("doctorId").value = data[0].id;
  } catch (err) {
    show("doctorResult", err);
  }
}

async function createScreening() {
  try {
    const symptoms = document.getElementById("symptoms").value.split(",").map(s => s.trim()).filter(Boolean);
    const data = await request("/api/screenings", {
      method: "POST",
      body: JSON.stringify({
        main_complaint: document.getElementById("complaint").value,
        symptoms,
        duration: document.getElementById("duration").value,
        answers: [
          { question: "Have you taken any medication?", answer: "No" },
          { question: "Do you have difficulty breathing?", answer: "No" }
        ],
        disclaimer_accepted: true,
      }),
    });
    document.getElementById("screeningId").value = data.id;
    show("screeningResult", data);
  } catch (err) {
    show("screeningResult", err);
  }
}

async function bookAppointment() {
  try {
    const data = await request("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        doctor_id: document.getElementById("doctorId").value,
        ai_screening_id: document.getElementById("screeningId").value || null,
        appointment_date: document.getElementById("appointmentDate").value,
        appointment_time: document.getElementById("appointmentTime").value,
        consultation_type: document.getElementById("consultationType").value,
      }),
    });
    document.getElementById("appointmentId").value = data.id;
    show("appointmentResult", data);
  } catch (err) {
    show("appointmentResult", err);
  }
}

async function payAppointment() {
  try {
    const data = await request("/api/payments/pay", {
      method: "POST",
      body: JSON.stringify({
        appointment_id: document.getElementById("appointmentId").value,
        payment_method: document.getElementById("paymentMethod").value,
      }),
    });
    show("paymentResult", data);
  } catch (err) {
    show("paymentResult", err);
  }
}

async function listAppointments() {
  try {
    const data = await request("/api/appointments");
    show("appointmentsResult", data);
  } catch (err) {
    show("appointmentsResult", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  document.getElementById("appointmentDate").value = date.toISOString().slice(0, 10);
});
