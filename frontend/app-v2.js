const API = window.location.origin;
const TOKEN_KEY = "telemed_v2_token";
let token = localStorage.getItem(TOKEN_KEY) || "";
let currentUser = null;

const $ = (id) => document.getElementById(id);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
function setHTML(id, html) { qsa(`[id="${id}"]`).forEach(el => { el.innerHTML = html; }); }
function setText(id, text) { qsa(`[id="${id}"]`).forEach(el => { el.textContent = text; }); }

function setAlert(id, message, type = "info") {
  const el = $(id);
  if (!el) return;
  el.className = `alert ${type}`;
  el.textContent = message;
  el.style.display = message ? "block" : "none";
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function badge(value) {
  const v = String(value || "").toLowerCase();
  let cls = "dark";
  if (["successful", "confirmed", "completed", "approved", "low", "active", "resolved"].includes(v)) cls = "success";
  if (["pending", "pending_payment", "moderate", "under_review"].includes(v)) cls = "warning";
  if (["failed", "cancelled", "rejected", "high", "emergency", "open"].includes(v)) cls = "danger";
  return `<span class="badge ${cls}">${value || "—"}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
}

async function request(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.message || JSON.stringify(data);
    throw new Error(Array.isArray(detail) ? detail.map(d => d.msg).join("; ") : detail);
  }
  return data;
}

async function getMe() {
  if (!token) return null;
  currentUser = await request("/api/auth/me");
  return currentUser;
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  token = "";
  window.location.href = "/static/index.html";
}

function fillUserUI() {
  if (!currentUser) return;
  qsa("[data-user-name]").forEach(el => el.textContent = currentUser.full_name);
  qsa("[data-user-role]").forEach(el => el.textContent = currentUser.role);
  qsa("[data-user-initial]").forEach(el => el.textContent = currentUser.full_name?.charAt(0)?.toUpperCase() || "U");
}

async function requireAuth(role = null) {
  try {
    const me = await getMe();
    if (!me) {
      window.location.href = "/static/index.html";
      return false;
    }
    const currentRole = String(me.role || "").toLowerCase();
    const targetRole = role ? String(role).toLowerCase() : null;
    if (targetRole && currentRole !== targetRole) {
      const map = { patient: "/static/patient-dashboard.html", doctor: "/static/doctor-dashboard.html", admin: "/static/admin-dashboard.html" };
      window.location.href = map[currentRole] || "/static/index.html";
      return false;
    }
    fillUserUI();
    return true;
  } catch (err) {
    console.warn("Auth validation error:", err);
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("telemed_token");
      window.location.href = "/static/index.html";
    }
    return false;
  }
}

function switchSection(id) {
  qsa(".page-section").forEach(s => s.classList.remove("active"));
  qsa(".nav-link").forEach(s => s.classList.remove("active"));
  const section = $(id);
  if (section) section.classList.add("active");
  qsa(`[data-section='${id}']`).forEach(s => s.classList.add("active"));
  localStorage.setItem("telemed_v2_section", id);
  if (window.innerWidth < 1050) $("sidebar")?.classList.remove("open");

  const widget = $("globalChatbotWidget");
  if (widget) {
    if (id === "patient-chatbot") {
      widget.style.display = "none";
      const drawer = $("globalChatbotDrawer");
      if (drawer) drawer.style.display = "none";
    } else {
      widget.style.display = "flex";
    }
  }
}

function wireNavigation(defaultSection) {
  qsa("[data-section]").forEach(el => el.addEventListener("click", () => switchSection(el.dataset.section)));
  $("menuBtn")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
  const saved = localStorage.getItem("telemed_v2_section");
  switchSection(saved && $(saved) ? saved : defaultSection);
}

function rowTable(headers, rows, emptyText = "No data yet.") {
  if (!rows || rows.length === 0) return `<div class="empty">${emptyText}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------- Landing/login ----------------
function useDemo(email, password) {
  if ($("loginEmail")) $("loginEmail").value = email;
  if ($("loginPassword")) $("loginPassword").value = password;
}


async function registerPatient() {
  try {
    setAlert("signupAlert", "Creating your patient account...", "info");

    const fullName = $("signupFullName")?.value.trim();
    const email = $("signupEmail")?.value.trim();
    const phone = $("signupPhone")?.value.trim();
    const password = $("signupPassword")?.value || "";
    const confirmPassword = $("signupConfirmPassword")?.value || "";

    if (!fullName || !email || !password) {
      throw new Error("Full name, email, and password are required.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    if (password !== confirmPassword) {
      throw new Error("Password and confirm password do not match.");
    }

    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone: phone || null,
        password,
        role: "patient",
        gender: $("signupGender")?.value || null,
        date_of_birth: $("signupDob")?.value || null,
        location: $("signupLocation")?.value || null,
        emergency_contact: $("signupEmergency")?.value || null
      })
    });

    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    token = data.access_token;
    localStorage.setItem(TOKEN_KEY, token);
    setAlert("signupAlert", "Account created successfully. Redirecting to your patient dashboard...", "success");
    window.location.href = "/static/patient-dashboard.html";
  } catch (err) {
    setAlert("signupAlert", err.message, "error");
  }
}

async function login() {
  try {
    setAlert("loginAlert", "Signing you in...", "info");
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("loginEmail").value.trim(), password: $("loginPassword").value })
    });
    token = data.access_token;
    localStorage.setItem(TOKEN_KEY, token);
    const me = await getMe();
    const map = { patient: "/static/patient-dashboard.html", doctor: "/static/doctor-dashboard.html", admin: "/static/admin-dashboard.html" };
    window.location.href = map[me.role] || "/static/index.html";
  } catch (err) {
    setAlert("loginAlert", err.message, "error");
  }
}

// ---------------- Patient page ----------------
async function patientInit() {
  if (!(await requireAuth("patient"))) return;
  wireNavigation("patient-overview");
  if ($("appointmentDate")) $("appointmentDate").value = tomorrowDate();
  await Promise.allSettled([loadPatientProfile(), loadDoctors(), loadScreenings(), loadAppointments(), loadPayments(), loadRecords(), loadPrescriptions(), loadNotifications()]);
}

async function loadPatientProfile() {
  const data = await request("/api/patients/profile");
  if ($("profileGender")) $("profileGender").value = data.gender || "";
  if ($("profileDob")) $("profileDob").value = data.date_of_birth || "";
  if ($("profileLocation")) $("profileLocation").value = data.location || "";
  if ($("profileEmergency")) $("profileEmergency").value = data.emergency_contact || "";
  if ($("profileAllergies")) $("profileAllergies").value = data.allergies || "";
  if ($("profileConditions")) $("profileConditions").value = data.medical_conditions || "";
  if ($("profileMeds")) $("profileMeds").value = data.current_medications || "";
}

async function updatePatientProfile() {
  try {
    const data = await request("/api/patients/profile", {
      method: "PUT",
      body: JSON.stringify({
        gender: $("profileGender").value || null,
        date_of_birth: $("profileDob").value || null,
        location: $("profileLocation").value || null,
        emergency_contact: $("profileEmergency").value || null,
        allergies: $("profileAllergies").value || null,
        medical_conditions: $("profileConditions").value || null,
        current_medications: $("profileMeds").value || null,
      })
    });
    setAlert("profileAlert", "Profile updated successfully.", "success");
    return data;
  } catch (err) { setAlert("profileAlert", err.message, "error"); }
}

async function loadDoctors() {
  const specialty = $("doctorSearch")?.value?.trim();
  const path = specialty ? `/api/doctors?specialty=${encodeURIComponent(specialty)}` : "/api/doctors";
  const doctors = await request(path);
  if ($("doctorGrid")) {
    $("doctorGrid").innerHTML = doctors.map(d => `
      <div class="card doctor-card">
        <div class="doctor-top">
          <div class="doctor-avatar">${escapeHtml(d.user?.full_name?.charAt(0) || "D")}</div>
          <div><h3>${escapeHtml(d.user?.full_name || "Doctor")}</h3><span class="badge success">${escapeHtml(d.specialty)}</span></div>
        </div>
        <p>${escapeHtml(d.bio || "Available for online consultation.")}</p>
        <div class="kv"><span>Fee</span><strong>GHS ${Number(d.consultation_fee || 0).toFixed(2)}</strong></div>
        <div class="kv"><span>Experience</span><strong>${d.experience_years || 0} years</strong></div>
        <div class="kv"><span>Languages</span><strong>${escapeHtml(d.languages || "Not specified")}</strong></div>
        <button class="btn block" onclick="selectDoctor('${d.id}', '${escapeHtml(d.user?.full_name || "Doctor")}')">Select Doctor</button>
      </div>`).join("") || `<div class="empty">No approved doctors found.</div>`;
  }
  const select = $("doctorId");
  if (select) select.innerHTML = doctors.map(d => `<option value="${d.id}">${escapeHtml(d.user?.full_name || "Doctor")} — ${escapeHtml(d.specialty)} — GHS ${d.consultation_fee}</option>`).join("");
  $("statDoctors") && ($("statDoctors").textContent = doctors.length);
  return doctors;
}

function selectDoctor(id, name) {
  switchSection("patient-booking");
  if ($("doctorId")) $("doctorId").value = id;
  setAlert("bookingAlert", `${name} selected. Complete screening and booking details.`, "info");
}

async function createScreening() {
  try {
    const symptoms = $("symptoms").value.split(",").map(s => s.trim()).filter(Boolean);
    const answers = [
      { question: "Have you taken any medication?", answer: $("screeningMedication").value || "No" },
      { question: "Do you have difficulty breathing?", answer: $("screeningBreathing").value || "No" },
      { question: "Do you have allergies?", answer: $("screeningAllergy").value || "No" },
    ];
    const data = await request("/api/screenings", {
      method: "POST",
      body: JSON.stringify({
        main_complaint: $("complaint").value,
        symptoms,
        duration: $("duration").value,
        answers,
        disclaimer_accepted: $("disclaimerAccepted").checked,
      })
    });
    if ($("screeningId")) $("screeningId").value = data.id;
    setAlert("screeningAlert", `Screening completed. Risk level: ${data.risk_level}. Recommended: ${data.recommended_specialty}.`, data.emergency_flag ? "error" : "success");
    $("screeningSummary") && ($("screeningSummary").innerHTML = `<h3>AI Summary</h3><p>${escapeHtml(data.ai_summary)}</p>${badge(data.risk_level)}`);
    await loadScreenings();
  } catch (err) { setAlert("screeningAlert", err.message, "error"); }
}

async function loadScreenings() {
  const data = await request("/api/screenings/me");
  if ($("screeningList")) $("screeningList").innerHTML = rowTable(["Complaint", "Risk", "Specialty", "Date", "Use"], data.map(s => `
    <tr><td>${escapeHtml(s.main_complaint)}</td><td>${badge(s.risk_level)}</td><td>${escapeHtml(s.recommended_specialty)}</td><td>${formatDate(s.created_at)}</td><td><button class="btn secondary" onclick="useScreening('${s.id}')">Use</button></td></tr>`), "No screenings yet.");
  const emergencies = data.filter(s => s.emergency_flag).length;
  $("statScreenings") && ($("statScreenings").textContent = data.length);
  $("statEmergency") && ($("statEmergency").textContent = emergencies);
  return data;
}

function useScreening(id) { switchSection("patient-booking"); $("screeningId").value = id; }

async function bookAppointment() {
  try {
    const data = await request("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        doctor_id: $("doctorId").value,
        ai_screening_id: $("screeningId").value || null,
        appointment_date: $("appointmentDate").value,
        appointment_time: $("appointmentTime").value,
        consultation_type: $("consultationType").value,
      })
    });
    if ($("paymentAppointmentId")) $("paymentAppointmentId").value = data.id;
    setAlert("bookingAlert", "Appointment created. Complete payment to confirm.", "success");
    await loadAppointments();
    switchSection("patient-payments");
  } catch (err) { setAlert("bookingAlert", err.message, "error"); }
}

async function payAppointment() {
  try {
    const data = await request("/api/payments/pay", {
      method: "POST",
      body: JSON.stringify({ appointment_id: $("paymentAppointmentId").value, payment_method: $("paymentMethod").value })
    });
    setAlert("paymentAlert", `Payment successful. Ref: ${data.transaction_reference}`, "success");
    await Promise.allSettled([loadPayments(), loadAppointments(), loadNotifications()]);
  } catch (err) { setAlert("paymentAlert", err.message, "error"); }
}

async function loadAppointments() {
  const data = await request("/api/appointments");
  setHTML("appointmentsTable", rowTable(["Date", "Time", "Type", "Status", "Payment", "Action"], data.map(a => `
    <tr><td>${a.appointment_date}</td><td>${a.appointment_time}</td><td>${a.consultation_type}</td><td>${badge(a.status)}</td><td>${badge(a.payment_status)}</td><td>${a.status === "pending_payment" ? `<button class="btn secondary" onclick="setPaymentAppointment('${a.id}')">Pay</button>` : `<a class="btn ghost" href="${a.consultation_link || `/static/consultation.html?appointment_id=${a.id}`}" target="_blank">Join ${a.consultation_type === "audio" ? "Audio" : "Video"}</a>`}</td></tr>`), "No appointments yet."));
  if ($("appointmentSelect")) $("appointmentSelect").innerHTML = data.map(a => `<option value="${a.id}">${a.appointment_date} ${a.appointment_time} — ${a.status}</option>`).join("");
  if ($("paymentAppointmentId") && data.find(a => a.status === "pending_payment")) $("paymentAppointmentId").value = data.find(a => a.status === "pending_payment").id;
  $("statAppointments") && ($("statAppointments").textContent = data.length);
  return data;
}
function setPaymentAppointment(id) { switchSection("patient-payments"); $("paymentAppointmentId").value = id; }

async function loadPayments() {
  const data = await request("/api/payments/history");
  if ($("paymentsTable")) $("paymentsTable").innerHTML = rowTable(["Amount", "Method", "Reference", "Status", "Date"], data.map(p => `
    <tr><td>GHS ${Number(p.amount).toFixed(2)}</td><td>${escapeHtml(p.payment_method)}</td><td>${escapeHtml(p.transaction_reference)}</td><td>${badge(p.status)}</td><td>${formatDate(p.created_at)}</td></tr>`), "No payment history yet.");
  $("statPayments") && ($("statPayments").textContent = data.length);
  return data;
}

async function uploadRecord() {
  try {
    const file = $("recordFile").files[0];
    if (!file) throw new Error("Select a file to upload.");
    const fd = new FormData();
    fd.append("title", $("recordTitle").value);
    fd.append("description", $("recordDescription").value);
    if ($("appointmentSelect").value) fd.append("appointment_id", $("appointmentSelect").value);
    fd.append("file", file);
    await request("/api/medical-records/upload", { method: "POST", body: fd });
    setAlert("recordAlert", "Medical record uploaded successfully.", "success");
    $("recordFile").value = "";
    await loadRecords();
  } catch (err) { setAlert("recordAlert", err.message, "error"); }
}

async function loadRecords() {
  const data = await request("/api/medical-records");
  if ($("recordsTable")) $("recordsTable").innerHTML = rowTable(["Title", "Type", "Description", "Uploaded", "File"], data.map(r => `
    <tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.file_type)}</td><td>${escapeHtml(r.description || "")}</td><td>${formatDate(r.uploaded_at)}</td><td><a class="btn ghost" href="${r.file_url}" target="_blank">Open</a></td></tr>`), "No records uploaded yet.");
  $("statRecords") && ($("statRecords").textContent = data.length);
  return data;
}

async function loadPrescriptions() {
  const data = await request("/api/prescriptions");
  if ($("prescriptionsTable")) $("prescriptionsTable").innerHTML = rowTable(["Issued", "Note", "Medication", "Signature"], data.map(p => `
    <tr><td>${formatDate(p.issued_at)}</td><td>${escapeHtml(p.prescription_note || "")}</td><td>${p.items.map(i => `<strong>${escapeHtml(i.drug_name)}</strong> ${escapeHtml(i.dosage)} ${escapeHtml(i.frequency)} for ${escapeHtml(i.duration)}`).join("<br>")}</td><td>${escapeHtml(p.digital_signature || "")}</td></tr>`), "No prescriptions yet.");
  $("statPrescriptions") && ($("statPrescriptions").textContent = data.length);
  return data;
}

async function createComplaint() {
  try {
    await request("/api/complaints", { method: "POST", body: JSON.stringify({ appointment_id: $("complaintAppointmentId").value || null, category: $("complaintCategory").value, description: $("complaintDescription").value }) });
    setAlert("complaintAlert", "Complaint submitted.", "success");
  } catch (err) { setAlert("complaintAlert", err.message, "error"); }
}

async function loadNotifications() {
  const data = await request("/api/notifications");
  if ($("notificationsList")) $("notificationsList").innerHTML = data.map(n => `<div class="alert info"><strong>${escapeHtml(n.title)}</strong><br>${escapeHtml(n.message)}<br><small>${formatDate(n.created_at)}</small></div>`).join("") || `<div class="empty">No notifications.</div>`;
  return data;
}

// ---------------- Doctor page ----------------
async function doctorInit() {
  if (!(await requireAuth("doctor"))) return;
  wireNavigation("doctor-overview");
  await Promise.allSettled([loadDoctorProfile(), loadDoctorAppointments(), loadDoctorRecords(), loadDoctorConsultations(), loadDoctorPrescriptions(), loadDoctorPayments(), loadDoctorAvailability(), loadNotifications()]);
}

async function loadDoctorProfile() {
  const d = await request("/api/doctors/me");
  if ($("docSpecialty")) $("docSpecialty").value = d.specialty || "";
  if ($("docQualification")) $("docQualification").value = d.qualification || "";
  if ($("docExperience")) $("docExperience").value = d.experience_years || 0;
  if ($("docLanguages")) $("docLanguages").value = d.languages || "";
  if ($("docFee")) $("docFee").value = d.consultation_fee || 0;
  if ($("docBio")) $("docBio").value = d.bio || "";
}

async function updateDoctorProfile() {
  try {
    await request("/api/doctors/profile", { method: "PUT", body: JSON.stringify({ specialty: $("docSpecialty").value, qualification: $("docQualification").value, experience_years: Number($("docExperience").value || 0), languages: $("docLanguages").value, consultation_fee: Number($("docFee").value || 0), bio: $("docBio").value }) });
    setAlert("doctorProfileAlert", "Doctor profile updated.", "success");
  } catch (err) { setAlert("doctorProfileAlert", err.message, "error"); }
}

async function addAvailability() {
  try {
    await request("/api/doctors/availability", { method: "POST", body: JSON.stringify({ day_of_week: $("availDay").value, start_time: $("availStart").value, end_time: $("availEnd").value, is_available: true }) });
    setAlert("availabilityAlert", "Availability added.", "success");
    await loadDoctorAvailability();
  } catch (err) { setAlert("availabilityAlert", err.message, "error"); }
}

async function loadDoctorAvailability() {
  const data = await request("/api/doctors/availability/me");
  if ($("availabilityTable")) $("availabilityTable").innerHTML = rowTable(["Day", "Start", "End", "Status"], data.map(a => `<tr><td>${a.day_of_week}</td><td>${a.start_time}</td><td>${a.end_time}</td><td>${a.is_available ? badge("available") : badge("unavailable")}</td></tr>`), "No availability set.");
}

async function loadDoctorAppointments() {
  const data = await request("/api/appointments");
  setHTML("doctorAppointmentsTable", rowTable(["Date", "Time", "Type", "Status", "Payment", "Use"], data.map(a => `
    <tr><td>${a.appointment_date}</td><td>${a.appointment_time}</td><td>${a.consultation_type}</td><td>${badge(a.status)}</td><td>${badge(a.payment_status)}</td><td><div class="button-row"><a class="btn ghost" href="${a.consultation_link || `/static/consultation.html?appointment_id=${a.id}`}" target="_blank">Join ${a.consultation_type === "audio" ? "Audio" : "Video"}</a><button class="btn secondary" onclick="useAppointmentForConsultation('${a.id}')">Notes</button></div></td></tr>`), "No patient appointments yet."));
  if ($("consultAppointmentId")) $("consultAppointmentId").innerHTML = data.map(a => `<option value="${a.id}">${a.appointment_date} ${a.appointment_time} — ${a.status}</option>`).join("");
  $("doctorStatAppointments") && ($("doctorStatAppointments").textContent = data.length);
  return data;
}
function useAppointmentForConsultation(id) { switchSection("doctor-consultation"); if ($("consultAppointmentId")) $("consultAppointmentId").value = id; }

async function createConsultation() {
  try {
    const c = await request("/api/consultations", { method: "POST", body: JSON.stringify({ appointment_id: $("consultAppointmentId").value, consultation_notes: $("consultNotes").value, diagnosis_summary: $("diagnosisSummary").value, treatment_plan: $("treatmentPlan").value, follow_up_required: $("followUpRequired").checked, follow_up_date: $("followUpDate").value || null, complete_now: true }) });
    if ($("prescriptionConsultationId")) $("prescriptionConsultationId").value = c.id;
    setAlert("consultationAlert", "Consultation saved. You can now issue a prescription.", "success");
    await Promise.allSettled([loadDoctorAppointments(), loadDoctorConsultations()]);
  } catch (err) { setAlert("consultationAlert", err.message, "error"); }
}

async function loadDoctorConsultations() {
  const data = await request("/api/consultations/history");
  if ($("consultationsTable")) $("consultationsTable").innerHTML = rowTable(["Date", "Diagnosis", "Plan", "Use"], data.map(c => `<tr><td>${formatDate(c.created_at)}</td><td>${escapeHtml(c.diagnosis_summary || "")}</td><td>${escapeHtml(c.treatment_plan || "")}</td><td><button class="btn secondary" onclick="useConsultationForPrescription('${c.id}')">Prescribe</button></td></tr>`), "No consultations saved.");
  if ($("prescriptionConsultationSelect")) $("prescriptionConsultationSelect").innerHTML = data.map(c => `<option value="${c.id}">${formatDate(c.created_at)} — ${escapeHtml(c.diagnosis_summary || "Consultation")}</option>`).join("");
  $("doctorStatConsultations") && ($("doctorStatConsultations").textContent = data.length);
}
function useConsultationForPrescription(id) { switchSection("doctor-prescriptions"); if ($("prescriptionConsultationSelect")) $("prescriptionConsultationSelect").value = id; }

async function createPrescription() {
  try {
    const consultationId = $("prescriptionConsultationId")?.value || $("prescriptionConsultationSelect")?.value;
    await request("/api/prescriptions", { method: "POST", body: JSON.stringify({ consultation_id: consultationId, prescription_note: $("prescriptionNote").value, items: [{ drug_name: $("drugName").value, dosage: $("dosage").value, frequency: $("frequency").value, duration: $("drugDuration").value, instructions: $("instructions").value, warning: $("warning").value }] }) });
    setAlert("prescriptionAlert", "Prescription issued successfully.", "success");
    await loadDoctorPrescriptions();
  } catch (err) { setAlert("prescriptionAlert", err.message, "error"); }
}

async function loadDoctorPrescriptions() {
  const data = await request("/api/prescriptions");
  if ($("doctorPrescriptionsTable")) $("doctorPrescriptionsTable").innerHTML = rowTable(["Issued", "Medication", "Note"], data.map(p => `<tr><td>${formatDate(p.issued_at)}</td><td>${p.items.map(i => `${escapeHtml(i.drug_name)} — ${escapeHtml(i.dosage)}, ${escapeHtml(i.frequency)}, ${escapeHtml(i.duration)}`).join("<br>")}</td><td>${escapeHtml(p.prescription_note || "")}</td></tr>`), "No prescriptions issued.");
  $("doctorStatPrescriptions") && ($("doctorStatPrescriptions").textContent = data.length);
}

async function loadDoctorRecords() {
  const data = await request("/api/medical-records");
  if ($("doctorRecordsTable")) $("doctorRecordsTable").innerHTML = rowTable(["Title", "Type", "Description", "File"], data.map(r => `<tr><td>${escapeHtml(r.title)}</td><td>${r.file_type}</td><td>${escapeHtml(r.description || "")}</td><td><a class="btn ghost" href="${r.file_url}" target="_blank">Open</a></td></tr>`), "No linked patient records yet.");
}

async function loadDoctorPayments() {
  const data = await request("/api/payments/history");
  $("doctorStatRevenue") && ($("doctorStatRevenue").textContent = `GHS ${data.filter(p=>p.status === "successful").reduce((s,p)=>s+Number(p.amount||0),0).toFixed(2)}`);
}

// ---------------- Admin page ----------------
async function adminInit() {
  if (!(await requireAuth("admin"))) return;
  wireNavigation("admin-overview");
  await Promise.allSettled([loadAdminDashboard(), loadPendingDoctors(), loadAdminUsers(), loadAdminPayments(), loadAdminComplaints(), loadAdminAuditLogs()]);
}

async function loadAdminDashboard() {
  const s = await request("/api/admin/dashboard");
  const map = { totalPatients: s.total_patients, totalDoctors: s.total_doctors, pendingDoctors: s.pending_doctor_approvals, totalAppointments: s.total_appointments, completedAppointments: s.completed_appointments, successfulPayments: s.successful_payments, totalRevenue: `GHS ${Number(s.total_revenue).toFixed(2)}`, emergencyScreenings: s.emergency_screenings, openComplaints: s.open_complaints };
  Object.entries(map).forEach(([id, val]) => $(id) && ($(""+id).textContent = val));
}

async function loadPendingDoctors() {
  const data = await request("/api/admin/doctors/pending");
  if ($("pendingDoctorsTable")) $("pendingDoctorsTable").innerHTML = rowTable(["Doctor", "Specialty", "License", "Action"], data.map(d => `<tr><td>${escapeHtml(d.user?.full_name || "")}</td><td>${escapeHtml(d.specialty)}</td><td>${escapeHtml(d.license_number)}</td><td><button class="btn" onclick="approveDoctor('${d.id}')">Approve</button> <button class="btn danger" onclick="rejectDoctor('${d.id}')">Reject</button></td></tr>`), "No pending doctor approvals.");
}
async function approveDoctor(id) { await request(`/api/admin/doctors/${id}/approve`, { method: "PUT" }); await Promise.allSettled([loadPendingDoctors(), loadAdminDashboard()]); }
async function rejectDoctor(id) { await request(`/api/admin/doctors/${id}/reject`, { method: "PUT" }); await Promise.allSettled([loadPendingDoctors(), loadAdminDashboard()]); }

let adminUsersCache = {};

async function loadAdminUsers() {
  const data = await request("/api/admin/users");
  adminUsersCache = {};
  data.forEach(u => { adminUsersCache[u.id] = u; });

  if ($("adminUsersTable")) {
    $("adminUsersTable").innerHTML = rowTable(
      ["Name", "Email", "Phone", "Role", "Password", "Status", "Created", "Action"],
      data.map(u => `<tr>
        <td><strong>${escapeHtml(u.full_name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.phone || "-")}</td>
        <td>${badge(u.role)}</td>
        <td><code style="background:var(--card-bg-alt,#f1f5f9);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.85rem">${escapeHtml(u.password_plain || "••••••••")}</code></td>
        <td>${badge(u.status)}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-sm secondary" onclick="openEditUserModal('${u.id}')">
            <span class="material-symbols-outlined" style="font-size:15px;vertical-align:-2px">edit</span> Edit
          </button>
        </td>
      </tr>`),
      "No users registered yet."
    );
  }
}

function openEditUserModal(userId) {
  const u = adminUsersCache[userId];
  if (!u) return;

  $("editUserId").value = u.id;
  $("editUserFullName").value = u.full_name || "";
  $("editUserEmail").value = u.email || "";
  $("editUserPhone").value = u.phone || "";
  $("editUserRole").value = u.role || "patient";
  $("editUserStatus").value = u.status || "active";
  $("editUserNewPassword").value = "";

  const alertBox = $("editUserAlert");
  if (alertBox) alertBox.style.display = "none";

  const modal = $("editUserModal");
  if (modal) modal.style.display = "flex";
}

function closeEditUserModal() {
  const modal = $("editUserModal");
  if (modal) modal.style.display = "none";
}

async function adminSaveUser() {
  try {
    const userId = $("editUserId").value;
    if (!userId) return;

    const payload = {
      full_name: $("editUserFullName").value.trim(),
      email: $("editUserEmail").value.trim(),
      phone: $("editUserPhone").value.trim(),
      role: $("editUserRole").value,
      status: $("editUserStatus").value,
    };

    const newPass = $("editUserNewPassword").value.trim();
    if (newPass) {
      if (newPass.length < 6) {
        setAlert("editUserAlert", "New password must be at least 6 characters.", "error");
        return;
      }
      payload.new_password = newPass;
    }

    await request(`/api/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    closeEditUserModal();
    await Promise.allSettled([loadAdminUsers(), loadAdminDashboard(), loadAdminAuditLogs()]);
  } catch (err) {
    setAlert("editUserAlert", err.message, "error");
  }
}


async function loadAdminPayments() {
  const data = await request("/api/admin/payments");
  if ($("adminPaymentsTable")) $("adminPaymentsTable").innerHTML = rowTable(["Amount", "Method", "Status", "Reference", "Date"], data.map(p => `<tr><td>GHS ${Number(p.amount).toFixed(2)}</td><td>${escapeHtml(p.payment_method)}</td><td>${badge(p.status)}</td><td>${escapeHtml(p.transaction_reference)}</td><td>${formatDate(p.created_at)}</td></tr>`), "No payments.");
}

async function loadAdminComplaints() {
  const data = await request("/api/complaints");
  if ($("adminComplaintsTable")) $("adminComplaintsTable").innerHTML = rowTable(["Category", "Description", "Status", "Date"], data.map(c => `<tr><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.description)}</td><td>${badge(c.status)}</td><td>${formatDate(c.created_at)}</td></tr>`), "No complaints.");
}

async function createScreeningQuestion() {
  try {
    await request("/api/admin/screening-questions", { method: "POST", body: JSON.stringify({ complaint_category: $("qCategory").value, question_text: $("qText").value, question_type: $("qType").value, is_emergency_question: $("qEmergency").checked, status: "active" }) });
    setAlert("questionAlert", "Screening question added.", "success");
  } catch (err) { setAlert("questionAlert", err.message, "error"); }
}

async function loadAdminAuditLogs() {
  const data = await request("/api/admin/audit-logs");
  if ($("auditLogsTable")) $("auditLogsTable").innerHTML = rowTable(["Action", "Entity", "Entity ID", "Date"], data.slice(0, 80).map(l => `<tr><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.entity || "")}</td><td>${escapeHtml(l.entity_id || "")}</td><td>${formatDate(l.created_at)}</td></tr>`), "No audit logs.");
}


// ---------------- Live video/audio consultation room ----------------
let roomAppointmentId = null;
let roomDetails = null;
let roomSocket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
let micEnabled = true;
let cameraEnabled = true;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function getAppointmentIdFromUrl() {
  return new URLSearchParams(window.location.search).get("appointment_id");
}

function appendRoomMessage(sender, message, isSystem = false) {
  const box = $("roomMessages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `room-message ${isSystem ? "system" : ""}`;
  div.innerHTML = isSystem ? escapeHtml(message) : `<strong>${escapeHtml(sender)}</strong>${escapeHtml(message)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setConnectionStatus(message, type = "info") {
  const el = $("connectionStatus");
  if (!el) return;
  el.textContent = message;
  el.className = `hint ${type}`;
}

async function consultationInit() {
  if (!(await requireAuth())) return;
  roomAppointmentId = getAppointmentIdFromUrl();
  if (!roomAppointmentId) {
    setConnectionStatus("Missing appointment ID. Open the room from an appointment Join button.", "error");
    return;
  }

  try {
    roomDetails = await request(`/api/consultation-room/${roomAppointmentId}`);
    const otherName = currentUser.role === "patient" ? roomDetails.doctor_name : roomDetails.patient_name;
    if ($("remoteLabel")) $("remoteLabel").textContent = otherName;
    if ($("roomSubtitle")) $("roomSubtitle").textContent = `${roomDetails.consultation_type.toUpperCase()} consultation with ${otherName}`;
    if ($("roomInfo")) $("roomInfo").textContent = JSON.stringify(roomDetails, null, 2);

    setupPeerConnection();
    connectConsultationSocket();
    await startConsultationMedia();
  } catch (err) {
    setConnectionStatus(err.message, "error");
    appendRoomMessage("System", err.message, true);
  }
}

function setupPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);
  remoteStream = new MediaStream();
  const remoteVideo = $("remoteVideo");
  if (remoteVideo) remoteVideo.srcObject = remoteStream;

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    setConnectionStatus("Connected. Remote media is active.", "success");
  };

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal({ type: "webrtc", candidate });
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "connected") setConnectionStatus("Call connected.", "success");
    if (["disconnected", "failed", "closed"].includes(state)) setConnectionStatus(`Call ${state}.`, "warning");
  };

  peerConnection.onnegotiationneeded = makeOfferNow;
}


async function makeOfferNow() {
  if (!peerConnection || !localStream || peerConnection.signalingState !== "stable") return;
  try {
    makingOffer = true;
    await peerConnection.setLocalDescription();
    sendSignal({ type: "webrtc", description: peerConnection.localDescription });
  } catch (err) {
    appendRoomMessage("System", `Negotiation error: ${err.message}`, true);
  } finally {
    makingOffer = false;
  }
}

function connectConsultationSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  roomSocket = new WebSocket(`${wsProtocol}://${window.location.host}/ws/consultations/${roomAppointmentId}?token=${encodeURIComponent(token)}`);

  roomSocket.onopen = () => {
    setConnectionStatus("Consultation room connected. Waiting for the other participant if not yet present.", "info");
    sendSignal({ type: "ready", role: currentUser.role, name: currentUser.full_name });
  };

  roomSocket.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "system") {
      appendRoomMessage("System", data.message, true);
      return;
    }
    if (data.type === "peer-joined") {
      appendRoomMessage("System", `${data.name} joined the consultation.`, true);
      await makeOfferNow();
      return;
    }
    if (data.type === "peer-left") {
      appendRoomMessage("System", `${data.name} left the consultation.`, true);
      return;
    }
    if (data.type === "chat") {
      appendRoomMessage(data.sender || "Participant", data.message || "");
      return;
    }
    if (data.type === "ready") {
      appendRoomMessage("System", `${data.name || "Participant"} is ready.`, true);
      await makeOfferNow();
      return;
    }
    if (data.type === "webrtc") {
      await handleWebRTCSignal(data);
    }
  };

  roomSocket.onclose = () => setConnectionStatus("Consultation signaling disconnected.", "warning");
  roomSocket.onerror = () => setConnectionStatus("Consultation connection error.", "error");
}

async function startConsultationMedia() {
  try {
    const audio = true;
    const video = roomDetails?.consultation_type !== "audio";
    localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
    const localVideo = $("localVideo");
    if (localVideo) localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    setConnectionStatus(video ? "Camera and microphone started." : "Microphone started for audio consultation.", "success");
    if ($("startMediaBtn")) $("startMediaBtn").disabled = true;
    if ($("toggleCameraBtn")) $("toggleCameraBtn").style.display = video ? "inline-flex" : "none";
    sendSignal({ type: "ready", role: currentUser.role, name: currentUser.full_name });
    await makeOfferNow();
  } catch (err) {
    setConnectionStatus(`Could not access camera/microphone: ${err.message}`, "error");
    appendRoomMessage("System", "Allow camera and microphone permissions in the browser, then reload the room.", true);
  }
}

async function handleWebRTCSignal(data) {
  try {
    if (data.description) {
      const description = data.description;
      const readyForOffer = !makingOffer && (peerConnection.signalingState === "stable" || isSettingRemoteAnswerPending);
      const offerCollision = description.type === "offer" && !readyForOffer;
      const polite = currentUser.role === "patient";
      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;

      isSettingRemoteAnswerPending = description.type === "answer";
      await peerConnection.setRemoteDescription(description);
      isSettingRemoteAnswerPending = false;

      if (description.type === "offer") {
        await peerConnection.setLocalDescription();
        sendSignal({ type: "webrtc", description: peerConnection.localDescription });
      }
    } else if (data.candidate) {
      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (err) {
        if (!ignoreOffer) throw err;
      }
    }
  } catch (err) {
    appendRoomMessage("System", `WebRTC error: ${err.message}`, true);
  }
}

function sendSignal(payload) {
  if (roomSocket && roomSocket.readyState === WebSocket.OPEN) {
    roomSocket.send(JSON.stringify(payload));
  }
}

function sendRoomChat() {
  const input = $("roomChatInput");
  const message = input?.value.trim();
  if (!message) return;
  appendRoomMessage(currentUser.full_name || "Me", message);
  sendSignal({ type: "chat", sender: currentUser.full_name, message });
  input.value = "";
}

function toggleMicrophone() {
  const tracks = localStream?.getAudioTracks() || [];
  micEnabled = !micEnabled;
  tracks.forEach(track => track.enabled = micEnabled);
  if ($("toggleMicBtn")) $("toggleMicBtn").textContent = micEnabled ? "Mute Mic" : "Unmute Mic";
}

function toggleCamera() {
  const tracks = localStream?.getVideoTracks() || [];
  cameraEnabled = !cameraEnabled;
  tracks.forEach(track => track.enabled = cameraEnabled);
  if ($("toggleCameraBtn")) $("toggleCameraBtn").textContent = cameraEnabled ? "Turn Camera Off" : "Turn Camera On";
}

function leaveConsultation() {
  try { roomSocket?.close(); } catch {}
  try { peerConnection?.close(); } catch {}
  try { localStream?.getTracks().forEach(track => track.stop()); } catch {}
  returnToDashboard();
}

function returnToDashboard() {
  const map = { patient: "/static/patient-dashboard.html", doctor: "/static/doctor-dashboard.html", admin: "/static/admin-dashboard.html" };
  window.location.href = map[currentUser?.role] || "/static/index.html";
}

// ---------------- Global theme, language, chatbot, timeline, analytics upgrades ----------------
const LANGUAGE_NAMES = {
  en: "English", fr: "French", tw: "Twi", ee: "Ewe", gaa: "Ga", ha: "Hausa", ar: "Arabic", es: "Spanish", pt: "Portuguese", sw: "Swahili"
};

const MINI_TRANSLATIONS = {
  en: { dashboard: "Dashboard", appointments: "Appointments", payments: "Payments", records: "Medical Records", prescriptions: "Prescriptions", profile: "Profile", chatbot: "AI Chatbot", timeline: "Timeline" },
  fr: { dashboard: "Tableau de bord", appointments: "Rendez-vous", payments: "Paiements", records: "Dossiers médicaux", prescriptions: "Ordonnances", profile: "Profil", chatbot: "Chatbot IA", timeline: "Chronologie" },
  tw: { dashboard: "Dashboard", appointments: "Nhyiam", payments: "Sika tua", records: "Ayaresa ho nsɛm", prescriptions: "Aduru krataa", profile: "Profile", chatbot: "AI Nkɔmmɔ", timeline: "Bere nhyehyɛe" },
  ee: { dashboard: "Dashboard", appointments: "Dɔkta ŋkekewo", payments: "Fexexewo", records: "Lãmesẽ nuŋlɔɖiwo", prescriptions: "Atikekewo", profile: "Profile", chatbot: "AI Dzeɖoɖo", timeline: "Ɣeyiɣi nuŋlɔɖi" },
  gaa: { dashboard: "Dashboard", appointments: "Dokita gbɛi", payments: "Feei", records: "Yitsoŋmɔ wiemɔ", prescriptions: "Lɛkɔɔ shika", profile: "Profile", chatbot: "AI Kɛkɛeli", timeline: "Gbɛjianɔŋ" },
  ha: { dashboard: "Dashboard", appointments: "Alƙawura", payments: "Biyan kuɗi", records: "Bayanan lafiya", prescriptions: "Takardar magani", profile: "Profile", chatbot: "AI Mai Tattaunawa", timeline: "Jadawalin lokaci" },
  ar: { dashboard: "لوحة التحكم", appointments: "المواعيد", payments: "المدفوعات", records: "السجلات الطبية", prescriptions: "الوصفات", profile: "الملف الشخصي", chatbot: "مساعد الذكاء الاصطناعي", timeline: "الخط الزمني" },
  es: { dashboard: "Panel", appointments: "Citas", payments: "Pagos", records: "Registros médicos", prescriptions: "Recetas", profile: "Perfil", chatbot: "Chatbot de IA", timeline: "Cronología" },
  pt: { dashboard: "Painel", appointments: "Consultas", payments: "Pagamentos", records: "Registos médicos", prescriptions: "Receitas", profile: "Perfil", chatbot: "Chatbot IA", timeline: "Linha do tempo" },
  sw: { dashboard: "Dashibodi", appointments: "Miadi", payments: "Malipo", records: "Rekodi za matibabu", prescriptions: "Maagizo ya dawa", profile: "Wasifu", chatbot: "AI Chatbot", timeline: "Muda wa matukio" }
};

function applyTheme(theme) {
  document.body.classList.toggle("dark-mode", theme === "dark");
  localStorage.setItem("telemed_theme", theme);
  qsa("[data-theme-status]").forEach(el => el.textContent = theme === "dark" ? "Dark mode" : "Light mode");
}

async function loadPreferences() {
  try {
    const pref = await request("/api/settings/preferences");
    applyTheme(pref.theme || localStorage.getItem("telemed_theme") || "light");
    if ($("languageSelect")) $("languageSelect").value = pref.language || "en";
    if ($("themeSelect")) $("themeSelect").value = pref.theme || "light";
    qsa("[data-language-status]").forEach(el => el.textContent = LANGUAGE_NAMES[pref.language] || pref.language || "English");
    renderTranslationPreview(pref.language || "en");
    return pref;
  } catch {
    applyTheme(localStorage.getItem("telemed_theme") || "light");
  }
}

async function savePreferences() {
  try {
    const language = $("languageSelect")?.value || "en";
    const theme = $("themeSelect")?.value || "light";
    const pref = await request("/api/settings/preferences", { method: "PUT", body: JSON.stringify({ language, theme }) });
    applyTheme(pref.theme);
    qsa("[data-language-status]").forEach(el => el.textContent = LANGUAGE_NAMES[pref.language] || pref.language);
    renderTranslationPreview(pref.language);
    setAlert("settingsAlert", "Preferences saved successfully.", "success");
  } catch (err) { setAlert("settingsAlert", err.message, "error"); }
}

function renderTranslationPreview(lang) {
  const box = $("translationPreview");
  if (!box) return;
  const t = MINI_TRANSLATIONS[lang] || MINI_TRANSLATIONS.en;
  box.innerHTML = Object.entries(t).map(([k,v]) => `<div class="kv"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
}

async function toggleGlobalTheme() {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  applyTheme(next);
  try { await request("/api/settings/preferences", { method: "PUT", body: JSON.stringify({ theme: next }) }); } catch {}
}

let chatbotSessionId = null;
let audioReadoutEnabled = true;

function toggleAudioReadout() {
  audioReadoutEnabled = !audioReadoutEnabled;
  const btn = $("ttsToggleBtn");
  if (btn) btn.innerHTML = audioReadoutEnabled ? '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px">volume_up</span> Voice: On' : '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px">volume_off</span> Voice: Off';
}

function readAloudText(text) {
  if (!audioReadoutEnabled || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Speech synthesis failed:", e);
  }
}

function formatChatTime(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBotMessage(rawText) {
  if (!rawText) return "";
  
  let safeText = escapeHtml(rawText);

  // Bold text: **text** or __text__ -> <strong>text</strong>
  safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safeText = safeText.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Split into lines to format lists and paragraphs
  const lines = safeText.split(/\r?\n/);
  let htmlOutput = "";
  let inUnorderedList = false;
  let inOrderedList = false;

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Check bullet list item (•, -, *)
    const bulletMatch = trimmed.match(/^([•\-\*])\s+(.+)$/);
    // Check numbered list item (1., 2., 1), 2), etc.)
    const numberMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);

    if (bulletMatch) {
      if (inOrderedList) {
        htmlOutput += "</ol>";
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        htmlOutput += "<ul>";
        inUnorderedList = true;
      }
      htmlOutput += `<li>${bulletMatch[2]}</li>`;
    } else if (numberMatch) {
      if (inUnorderedList) {
        htmlOutput += "</ul>";
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        htmlOutput += "<ol>";
        inOrderedList = true;
      }
      htmlOutput += `<li>${numberMatch[2]}</li>`;
    } else {
      if (inUnorderedList) {
        htmlOutput += "</ul>";
        inUnorderedList = false;
      }
      if (inOrderedList) {
        htmlOutput += "</ol>";
        inOrderedList = false;
      }

      if (trimmed.length > 0) {
        htmlOutput += `<p>${trimmed}</p>`;
      }
    }
  });

  if (inUnorderedList) htmlOutput += "</ul>";
  if (inOrderedList) htmlOutput += "</ol>";

  return htmlOutput || `<p>${safeText}</p>`;
}

function usePromptChip(text) {
  const mainInput = $("chatbotInput");
  const globalInput = $("globalChatbotInput");
  if (mainInput) {
    mainInput.value = text;
    mainInput.focus();
  }
  if (globalInput) {
    globalInput.value = text;
    globalInput.focus();
  }
  sendChatbotMessage();
}

function toggleGlobalChatbot() {
  const drawer = $("globalChatbotDrawer");
  if (drawer) {
    const isHidden = drawer.style.display === "none";
    drawer.style.display = isHidden ? "flex" : "none";
    if (isHidden && $("globalChatbotInput")) {
      $("globalChatbotInput").focus();
    }
  }
}

async function resetChatbotSession() {
  chatbotSessionId = null;
  const thread = $("chatbotThread");
  const globalThread = $("globalChatbotThread");
  const welcomeHtml = `
    <div class="chat-line bot">
      <div class="chat-avatar bot-avatar"><span class="material-symbols-outlined">smart_toy</span></div>
      <div class="chat-content">
        <div class="chat-sender">ORIGEN AI Assistant <span class="chat-time">${formatChatTime()}</span></div>
        <p>New session started. Describe your symptoms and I will provide clinical guidance and specialty recommendations.</p>
        <div class="chat-disclaimer"><span class="material-symbols-outlined icon-inline" style="font-size:15px;vertical-align:-3px;color:var(--warning)">warning</span> Emergency symptoms should be handled immediately through urgent physical care.</div>
      </div>
    </div>`;
  if (thread) thread.innerHTML = welcomeHtml;
  if (globalThread) globalThread.innerHTML = welcomeHtml;
}

function filterDoctorSpecialty(specialty) {
  if (specialty === "Emergency Care") {
    alert("EMERGENCY NOTICE: If you are experiencing chest pain, severe shortness of breath, or heavy bleeding, please go directly to the nearest hospital emergency room.");
    return;
  }
  switchSection("patient-doctors");
  const searchInput = $("doctorSearchInput") || $("specialtySelect");
  if (searchInput) {
    searchInput.value = specialty;
    if (typeof filterDoctors === "function") filterDoctors();
  }
}

async function sendChatbotMessage() {
  try {
    const mainInput = $("chatbotInput");
    const globalInput = $("globalChatbotInput");
    const msg = (mainInput?.value || globalInput?.value || "").trim();
    if (!msg) return;

    if (mainInput) mainInput.value = "";
    if (globalInput) globalInput.value = "";

    const timeStr = formatChatTime();
    const userHtml = `
      <div class="chat-line patient">
        <div class="chat-avatar patient-avatar"><span class="material-symbols-outlined">person</span></div>
        <div class="chat-content">
          <div class="chat-sender">You <span class="chat-time">${timeStr}</span></div>
          <p>${escapeHtml(msg)}</p>
        </div>
      </div>`;

    const thread = $("chatbotThread");
    const globalThread = $("globalChatbotThread");
    const typing = $("chatbotTyping");
    const globalTyping = $("globalChatbotTyping");

    if (thread) {
      thread.innerHTML += userHtml;
      thread.scrollTop = thread.scrollHeight;
    }
    if (globalThread) {
      globalThread.innerHTML += userHtml;
      globalThread.scrollTop = globalThread.scrollHeight;
    }

    if (typing) typing.style.display = "flex";
    if (globalTyping) globalTyping.style.display = "flex";

    const language = $("languageSelect")?.value || "en";
    const res = await request("/api/chatbot/message", {
      method: "POST",
      body: JSON.stringify({ message: msg, session_id: chatbotSessionId, language })
    });
    chatbotSessionId = res.session_id;

    if (typing) typing.style.display = "none";
    if (globalTyping) globalTyping.style.display = "none";

    const formattedReply = formatBotMessage(res.reply || "");
    const riskClass = (res.risk_level || "low").toLowerCase();
    const riskTag = `<span class="risk-tag ${riskClass}">${escapeHtml(res.risk_level || "Low")} Risk</span>`;
    const specBtn = res.recommended_specialty && res.recommended_specialty !== "None"
      ? `<button class="book-spec-btn" onclick="filterDoctorSpecialty('${escapeHtml(res.recommended_specialty)}')"><span class="material-symbols-outlined" style="font-size:16px">stethoscope</span> Book ${escapeHtml(res.recommended_specialty)} Doctor</button>`
      : "";
    const cleanSpeechText = (res.reply || "").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
    const speakBtn = `<button class="speak-reply-btn" onclick="readAloudText('${escapeHtml(cleanSpeechText)}')"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">volume_up</span> Read Aloud</button>`;
    const disclaimerText = res.disclaimer || "AI chatbot guidance is not a final diagnosis. Emergency cases require immediate urgent care.";

    const botHtml = `
      <div class="chat-line bot">
        <div class="chat-avatar bot-avatar"><span class="material-symbols-outlined">smart_toy</span></div>
        <div class="chat-content">
          <div class="chat-sender">ORIGEN AI Assistant <span class="chat-time">${formatChatTime()}</span></div>
          ${formattedReply}
          <div class="chat-meta-tags">
            ${riskTag}
            ${speakBtn}
          </div>
          ${specBtn}
          <div class="chat-disclaimer"><span class="material-symbols-outlined icon-inline" style="font-size:14px;vertical-align:-2px;color:var(--warning)">warning</span> ${escapeHtml(disclaimerText)}</div>
        </div>
      </div>`;

    if (thread) {
      thread.innerHTML += botHtml;
      thread.scrollTop = thread.scrollHeight;
    }
    if (globalThread) {
      globalThread.innerHTML += botHtml;
      globalThread.scrollTop = globalThread.scrollHeight;
    }

    readAloudText(res.reply);
    await Promise.allSettled([loadTimeline(), loadNotifications()]);
  } catch (err) {
    const typing = $("chatbotTyping");
    const globalTyping = $("globalChatbotTyping");
    if (typing) typing.style.display = "none";
    if (globalTyping) globalTyping.style.display = "none";
    setAlert("chatbotAlert", err.message, "error");
  }
}

function sendGlobalChatbotMessage() {
  sendChatbotMessage();
}

async function loadChatbotHistory() {
  try {
    const res = await request("/api/chatbot/history");
    if (!res || !res.messages || res.messages.length === 0) return;
    chatbotSessionId = res.session_id;

    const thread = $("chatbotThread");
    const globalThread = $("globalChatbotThread");
    if (!thread && !globalThread) return;

    let html = "";
    res.messages.forEach(m => {
      const timeStr = formatChatTime(m.created_at);
      if (m.sender === "patient") {
        html += `
          <div class="chat-line patient">
            <div class="chat-avatar patient-avatar"><span class="material-symbols-outlined">person</span></div>
            <div class="chat-content">
              <div class="chat-sender">You <span class="chat-time">${timeStr}</span></div>
              <p>${escapeHtml(m.message)}</p>
            </div>
          </div>`;
      } else {
        const formattedMsg = formatBotMessage(m.message || "");
        const riskClass = (m.risk_level || "low").toLowerCase();
        const riskTag = m.risk_level ? `<span class="risk-tag ${riskClass}">${escapeHtml(m.risk_level)} Risk</span>` : "";
        const specBtn = m.recommended_specialty && m.recommended_specialty !== "None"
          ? `<button class="book-spec-btn" onclick="filterDoctorSpecialty('${escapeHtml(m.recommended_specialty)}')"><span class="material-symbols-outlined" style="font-size:16px">stethoscope</span> Book ${escapeHtml(m.recommended_specialty)} Doctor</button>`
          : "";
        const cleanSpeechText = (m.message || "").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
        const speakBtn = `<button class="speak-reply-btn" onclick="readAloudText('${escapeHtml(cleanSpeechText)}')"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">volume_up</span> Read Aloud</button>`;

        html += `
          <div class="chat-line bot">
            <div class="chat-avatar bot-avatar"><span class="material-symbols-outlined">smart_toy</span></div>
            <div class="chat-content">
              <div class="chat-sender">ORIGEN AI Assistant <span class="chat-time">${timeStr}</span></div>
              ${formattedMsg}
              <div class="chat-meta-tags">
                ${riskTag}
                ${speakBtn}
              </div>
              ${specBtn}
            </div>
          </div>`;
      }
    });

    if (thread) {
      thread.innerHTML = html;
      thread.scrollTop = thread.scrollHeight;
    }
    if (globalThread) {
      globalThread.innerHTML = html;
      globalThread.scrollTop = globalThread.scrollHeight;
    }
  } catch (err) {
    console.warn("Could not load chatbot history:", err);
  }
}

function speechToTextToInput(targetId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setAlert("chatbotAlert", "Speech-to-text is not supported in this browser. Use Chrome or Edge.", "error");
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const target = $(targetId);
    if (target) target.value = `${target.value ? target.value + " " : ""}${text}`;
  };
  rec.onerror = (event) => setAlert("chatbotAlert", `Speech error: ${event.error}`, "error");
  rec.start();
}


async function loadTimeline() {
  try {
    const data = await request("/api/patients/timeline");
    const box = $("timelineList");
    if (box) box.innerHTML = data.map(e => `<div class="timeline-item"><div class="timeline-dot"></div><div><strong>${escapeHtml(e.title)}</strong> ${badge(e.event_type)}<p>${escapeHtml(e.description || "")}</p><small>${formatDate(e.created_at)}</small></div></div>`).join("") || `<div class="empty">No timeline events yet.</div>`;
    return data;
  } catch (err) { if ($("timelineList")) $("timelineList").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`; }
}

function renderMiniChart(id, data) {
  const el = $(id);
  if (!el) return;
  const entries = Object.entries(data || {});
  if (!entries.length) { el.innerHTML = `<div class="empty">No analytics data yet.</div>`; return; }
  const max = Math.max(...entries.map(([,v]) => Number(v) || 0), 1);
  el.innerHTML = entries.map(([label, value]) => {
    const width = Math.max(4, (Number(value) / max) * 100);
    return `<div class="chart-row"><span>${escapeHtml(label)}</span><div class="bar"><i style="width:${width}%"></i></div><strong>${escapeHtml(value)}</strong></div>`;
  }).join("");
}

async function loadAdminAnalytics() {
  try {
    const data = await request("/api/admin/analytics");
    renderMiniChart("chartAppointments", data.appointments_by_status);
    renderMiniChart("chartRisks", data.ai_risk_distribution);
    renderMiniChart("chartRevenue", data.revenue_by_month);
    renderMiniChart("chartDoctors", data.consultations_by_doctor);
    renderMiniChart("chartLanguages", data.language_distribution);
    if ($("analyticsTotals")) $("analyticsTotals").innerHTML = Object.entries(data.totals).map(([k,v]) => `<div class="stat"><div class="value">${escapeHtml(v)}</div><div class="label">${escapeHtml(k)}</div></div>`).join("");
  } catch (err) { setAlert("analyticsAlert", err.message, "error"); }
}

// Patch existing initializers to include upgraded modules.
const _patientInitOriginal = patientInit;
patientInit = async function() {
  if (!(await requireAuth("patient"))) return;
  wireNavigation("patient-overview");
  await loadPreferences();
  if ($("appointmentDate")) $("appointmentDate").value = tomorrowDate();
  await Promise.allSettled([loadPatientProfile(), loadDoctors(), loadScreenings(), loadAppointments(), loadPayments(), loadRecords(), loadPrescriptions(), loadNotifications(), loadTimeline(), loadChatbotHistory()]);
};

const _doctorInitOriginal = doctorInit;
doctorInit = async function() {
  if (!(await requireAuth("doctor"))) return;
  wireNavigation("doctor-overview");
  await loadPreferences();
  await Promise.allSettled([loadDoctorProfile(), loadDoctorAppointments(), loadDoctorRecords(), loadDoctorConsultations(), loadDoctorPrescriptions(), loadDoctorPayments(), loadDoctorAvailability(), loadNotifications()]);
};

const _adminInitOriginal = adminInit;
adminInit = async function() {
  if (!(await requireAuth("admin"))) return;
  wireNavigation("admin-overview");
  await loadPreferences();
  await Promise.allSettled([loadAdminDashboard(), loadPendingDoctors(), loadAdminUsers(), loadAdminPayments(), loadAdminComplaints(), loadAdminAuditLogs(), loadAdminAnalytics()]);
};

// ---------------- Fully activated V3 corrections ----------------
async function viewAppointmentSummary(id) {
  try {
    if ($("summaryAppointmentId")) $("summaryAppointmentId").value = id;
    switchSection("doctor-summary");
    setAlert("summaryAlert", "Loading patient clinical summary...", "info");
    const data = await request(`/api/appointments/${id}/clinical-summary`);
    renderAppointmentSummary(data);
    setAlert("summaryAlert", "Clinical summary loaded.", "success");
  } catch (err) { setAlert("summaryAlert", err.message, "error"); }
}

async function viewAppointmentSummaryFromInput() {
  const id = $("summaryAppointmentId")?.value?.trim();
  if (!id) return setAlert("summaryAlert", "Enter or select an appointment ID.", "error");
  await viewAppointmentSummary(id);
}

function renderAppointmentSummary(data) {
  const box = $("appointmentSummaryBox");
  if (!box) return;
  const screening = data.ai_screening;
  const records = data.medical_records || [];
  const consultation = data.consultation;
  const prescriptions = data.prescriptions || [];
  box.innerHTML = `
    <div class="grid two">
      <div class="card soft-card">
        <h3>Patient</h3>
        <div class="kv"><span>Name</span><strong>${escapeHtml(data.patient?.name || "")}</strong></div>
        <div class="kv"><span>Gender</span><strong>${escapeHtml(data.patient?.gender || "—")}</strong></div>
        <div class="kv"><span>DOB</span><strong>${escapeHtml(data.patient?.date_of_birth || "—")}</strong></div>
        <div class="kv"><span>Location</span><strong>${escapeHtml(data.patient?.location || "—")}</strong></div>
        <div class="kv"><span>Allergies</span><strong>${escapeHtml(data.patient?.allergies || "—")}</strong></div>
        <div class="kv"><span>Conditions</span><strong>${escapeHtml(data.patient?.medical_conditions || "—")}</strong></div>
      </div>
      <div class="card soft-card">
        <h3>Appointment</h3>
        <div class="kv"><span>Date</span><strong>${escapeHtml(data.appointment?.date || "")}</strong></div>
        <div class="kv"><span>Time</span><strong>${escapeHtml(data.appointment?.time || "")}</strong></div>
        <div class="kv"><span>Type</span><strong>${badge(data.appointment?.consultation_type)}</strong></div>
        <div class="kv"><span>Status</span><strong>${badge(data.appointment?.status)}</strong></div>
        <div class="kv"><span>Payment</span><strong>${badge(data.appointment?.payment_status)}</strong></div>
      </div>
    </div>
    <div class="card soft-card" style="margin-top:16px">
      <h3>AI Screening Summary</h3>
      ${screening ? `<p>${escapeHtml(screening.ai_summary)}</p><div>${badge(screening.risk_level)} <span class="badge dark">${escapeHtml(screening.recommended_specialty)}</span></div><p><strong>Symptoms:</strong> ${escapeHtml(screening.symptoms || "")}</p>` : `<div class="empty">No AI screening linked to this appointment.</div>`}
    </div>
    <div class="card soft-card" style="margin-top:16px">
      <h3>Uploaded Medical Records</h3>
      ${records.length ? rowTable(["Title", "Type", "Uploaded", "File"], records.map(r => `<tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.file_type)}</td><td>${formatDate(r.uploaded_at)}</td><td><a class="btn ghost" href="${r.file_url}" target="_blank">Open</a></td></tr>`)) : `<div class="empty">No records uploaded for this appointment.</div>`}
    </div>
    <div class="card soft-card" style="margin-top:16px">
      <h3>Consultation and Prescription</h3>
      ${consultation ? `<p><strong>Diagnosis:</strong> ${escapeHtml(consultation.diagnosis_summary || "")}</p><p><strong>Treatment:</strong> ${escapeHtml(consultation.treatment_plan || "")}</p>` : `<div class="empty">No consultation note saved yet.</div>`}
      ${prescriptions.length ? prescriptions.map(p => `<div class="alert info"><strong>Prescription:</strong> ${p.items.map(i => `${escapeHtml(i.drug_name)} ${escapeHtml(i.dosage)} ${escapeHtml(i.frequency)} for ${escapeHtml(i.duration)}`).join("; ")}</div>`).join("") : ""}
    </div>`;
}

// Override doctor appointment table so Summary is truly usable.
loadDoctorAppointments = async function() {
  const data = await request("/api/appointments");
  if ($("doctorAppointmentsTable")) $("doctorAppointmentsTable").innerHTML = rowTable(["Date", "Time", "Type", "Status", "Payment", "Actions"], data.map(a => `
    <tr><td>${a.appointment_date}</td><td>${a.appointment_time}</td><td>${a.consultation_type}</td><td>${badge(a.status)}</td><td>${badge(a.payment_status)}</td><td><div class="button-row"><button class="btn secondary" onclick="viewAppointmentSummary('${a.id}')">Summary</button><a class="btn ghost" href="${a.consultation_link || `/static/consultation.html?appointment_id=${a.id}`}" target="_blank">Join ${a.consultation_type === "audio" ? "Audio" : "Video"}</a><button class="btn secondary" onclick="useAppointmentForConsultation('${a.id}')">Notes</button></div></td></tr>`), "No patient appointments yet.");
  if ($("consultAppointmentId")) $("consultAppointmentId").innerHTML = data.map(a => `<option value="${a.id}">${a.appointment_date} ${a.appointment_time} — ${a.status}</option>`).join("");
  if ($("summaryAppointmentId") && data[0]) $("summaryAppointmentId").value = data[0].id;
  $("doctorStatAppointments") && ($("doctorStatAppointments").textContent = data.length);
  return data;
};

loadAdminAuditLogs = async function() {
  const data = await request("/api/admin/audit-logs");
  if ($("auditLogsTable")) $("auditLogsTable").innerHTML = rowTable(["User", "Role", "Action", "Module", "Outcome", "Details", "Date"], data.slice(0, 120).map(l => `<tr><td>${escapeHtml(l.user_name || "System")}</td><td>${badge(l.user_role || "system")}</td><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.entity || "")}</td><td>${badge(l.outcome)}</td><td>${escapeHtml(l.details || "")}</td><td>${formatDate(l.created_at)}</td></tr>`), "No audit logs.");
};

loadAdminComplaints = async function() {
  const data = await request("/api/complaints");
  if ($("adminComplaintsTable")) $("adminComplaintsTable").innerHTML = rowTable(["Category", "Description", "Status", "Response", "Date", "Action"], data.map(c => `<tr><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.description)}</td><td>${badge(c.status)}</td><td>${escapeHtml(c.admin_response || "")}</td><td>${formatDate(c.created_at)}</td><td>${c.status !== "resolved" ? `<button class="btn secondary" onclick="resolveComplaint('${c.id}')">Resolve</button>` : "—"}</td></tr>`), "No complaints.");
};

async function resolveComplaint(id) {
  try {
    const fd = new FormData();
    fd.append("admin_response", "Resolved by administrator after review.");
    await request(`/api/admin/complaints/${id}/resolve`, { method: "PUT", body: fd });
    await Promise.allSettled([loadAdminComplaints(), loadAdminDashboard(), loadAdminAuditLogs()]);
  } catch (err) { alert(err.message); }
}

async function adminCreatePatient() {
  try {
    await request("/api/admin/create-user", { method: "POST", body: JSON.stringify({
      role: "patient",
      full_name: $("adminPatientName").value,
      email: $("adminPatientEmail").value,
      phone: $("adminPatientPhone").value || null,
      password: $("adminPatientPassword").value,
      gender: $("adminPatientGender").value || null,
      date_of_birth: $("adminPatientDob").value || null,
      location: $("adminPatientLocation").value || null
    }) });
    setAlert("adminPatientAlert", "Patient account created and activated.", "success");
    await Promise.allSettled([loadAdminUsers(), loadAdminDashboard(), loadAdminAuditLogs()]);
  } catch (err) { setAlert("adminPatientAlert", err.message, "error"); }
}

async function adminCreateDoctor() {
  try {
    await request("/api/admin/create-user", { method: "POST", body: JSON.stringify({
      role: "doctor",
      full_name: $("adminDoctorName").value,
      email: $("adminDoctorEmail").value,
      phone: $("adminDoctorPhone").value || null,
      password: $("adminDoctorPassword").value,
      license_number: $("adminDoctorLicense").value,
      specialty: $("adminDoctorSpecialty").value,
      qualification: $("adminDoctorQualification").value || null,
      consultation_fee: Number($("adminDoctorFee").value || 0),
      experience_years: 0,
      languages: "English",
      bio: "Doctor account created by administrator."
    }) });
    setAlert("adminDoctorAlert", "Doctor account created and approved.", "success");
    await Promise.allSettled([loadAdminUsers(), loadAdminDashboard(), loadPendingDoctors(), loadAdminAuditLogs()]);
  } catch (err) { setAlert("adminDoctorAlert", err.message, "error"); }
}

async function loadScreeningQuestions() {
  try {
    const data = await request("/api/screening-questions");
    if ($("screeningQuestionsTable")) $("screeningQuestionsTable").innerHTML = rowTable(["Category", "Question", "Type", "Emergency"], data.map(q => `<tr><td>${escapeHtml(q.complaint_category)}</td><td>${escapeHtml(q.question_text)}</td><td>${escapeHtml(q.question_type)}</td><td>${q.is_emergency_question ? badge("yes") : badge("no")}</td></tr>`), "No screening questions.");
    return data;
  } catch {}
}

const UI_TRANSLATIONS = {
  en: { overview:"Overview", doctors:"Find Doctors", screening:"AI Screening", chatbot:"AI Chatbot", timeline:"Timeline", booking:"Book Appointment", payments:"Payments", records:"Medical Records", prescriptions:"Prescriptions", profile:"Profile", settings:"Settings", analytics:"Analytics", audit:"Audit Logs", users:"Users", complaints:"Complaints" },
  fr: { overview:"Aperçu", doctors:"Médecins", screening:"Dépistage IA", chatbot:"Chatbot IA", timeline:"Chronologie", booking:"Rendez-vous", payments:"Paiements", records:"Dossiers médicaux", prescriptions:"Ordonnances", profile:"Profil", settings:"Paramètres", analytics:"Analytique", audit:"Journaux d’audit", users:"Utilisateurs", complaints:"Plaintes" },
  tw: { overview:"Nsɛm a ɛda so", doctors:"Hwehwɛ Dokita", screening:"AI Nhwehwɛmu", chatbot:"AI Nkɔmmɔ", timeline:"Bere nhyehyɛe", booking:"Yɛ Nhyehyɛe", payments:"Sika tua", records:"Ayaresa ho nsɛm", prescriptions:"Aduru krataa", profile:"Profile", settings:"Nhyehyɛe", analytics:"Nhwehwɛmu", audit:"Audit Logs", users:"Users", complaints:"Nsɛm" },
  sw: { overview:"Muhtasari", doctors:"Madaktari", screening:"Uchunguzi wa AI", chatbot:"AI Chatbot", timeline:"Muda wa matukio", booking:"Weka miadi", payments:"Malipo", records:"Rekodi za matibabu", prescriptions:"Maagizo ya dawa", profile:"Wasifu", settings:"Mipangilio", analytics:"Takwimu", audit:"Kumbukumbu za ukaguzi", users:"Watumiaji", complaints:"Malalamiko" }
};

function applyInterfaceTranslations(lang) {
  const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;
  const map = {
    "patient-overview": t.overview, "patient-doctors": t.doctors, "patient-screening": t.screening, "patient-chatbot": t.chatbot, "patient-timeline": t.timeline, "patient-booking": t.booking, "patient-payments": t.payments, "patient-records": t.records, "patient-prescriptions": t.prescriptions, "patient-profile": t.profile, "patient-settings": t.settings,
    "doctor-overview": t.overview, "doctor-appointments": t.booking, "doctor-summary": "Patient Summary", "doctor-consultation": "Consultation Notes", "doctor-prescriptions": t.prescriptions, "doctor-records": t.records, "doctor-profile": t.profile, "doctor-settings": t.settings,
    "admin-overview": t.overview, "admin-users": t.users, "admin-payments": t.payments, "admin-analytics": t.analytics, "admin-complaints": t.complaints, "admin-audit": t.audit, "admin-settings": t.settings
  };
  Object.entries(map).forEach(([section, label]) => {
    qsa(`[data-section='${section}']`).forEach(el => {
      const icon = el.querySelector('.icon')?.outerHTML || '';
      el.innerHTML = `${icon}${escapeHtml(label)}`;
    });
  });
}

const _loadPreferencesActivated = loadPreferences;
loadPreferences = async function() {
  const pref = await _loadPreferencesActivated();
  const lang = pref?.language || localStorage.getItem("telemed_language") || "en";
  applyInterfaceTranslations(lang);
  return pref;
};

const _savePreferencesActivated = savePreferences;
savePreferences = async function() {
  await _savePreferencesActivated();
  const lang = $("languageSelect")?.value || "en";
  localStorage.setItem("telemed_language", lang);
  applyInterfaceTranslations(lang);
};

const _adminInitActivated = adminInit;
adminInit = async function() {
  if (!(await requireAuth("admin"))) return;
  wireNavigation("admin-overview");
  await loadPreferences();
  await Promise.allSettled([loadAdminDashboard(), loadPendingDoctors(), loadAdminUsers(), loadAdminPayments(), loadAdminComplaints(), loadAdminAuditLogs(), loadAdminAnalytics(), loadScreeningQuestions()]);
};

// Make creating a new screening question refresh the list immediately.
const _createScreeningQuestionActivated = createScreeningQuestion;
createScreeningQuestion = async function() {
  await _createScreeningQuestionActivated();
  await Promise.allSettled([loadScreeningQuestions(), loadAdminAuditLogs()]);
};

// ---------------- Real multilingual API + persistent dark mode integration ----------------
let LANGUAGE_META = {};
let ACTIVE_TRANSLATIONS = {};

async function loadSupportedLanguages() {
  try {
    const langs = await fetch(`${API}/api/localization/languages`).then(r => r.json());
    LANGUAGE_META = Object.fromEntries(langs.map(l => [l.code, l]));
    const options = langs.map(l => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.native_name || l.name)} (${escapeHtml(l.name)})</option>`).join("");
    qsa("#languageSelect").forEach(sel => {
      const current = sel.value || localStorage.getItem("telemed_language") || "en";
      sel.innerHTML = options;
      sel.value = LANGUAGE_META[current] ? current : "en";
    });
    return langs;
  } catch (err) {
    console.warn("Could not load languages", err);
    return [];
  }
}

async function fetchLanguagePack(lang) {
  const language = lang || localStorage.getItem("telemed_language") || "en";
  try {
    const pack = await fetch(`${API}/api/localization/ui?language=${encodeURIComponent(language)}`).then(r => r.json());
    ACTIVE_TRANSLATIONS = pack.translations || {};
    document.documentElement.lang = pack.language || language;
    document.documentElement.dir = pack.direction || "ltr";
    return pack;
  } catch (err) {
    console.warn("Could not load UI language pack", err);
    ACTIVE_TRANSLATIONS = UI_TRANSLATIONS?.[language] || UI_TRANSLATIONS?.en || {};
    return { language, direction: "ltr", translations: ACTIVE_TRANSLATIONS, provider: "frontend_fallback" };
  }
}

function tr(key, fallback = "") {
  return ACTIVE_TRANSLATIONS[key] || fallback || key;
}

async function applyInterfaceTranslations(lang) {
  const pack = await fetchLanguagePack(lang);
  const t = pack.translations || {};
  const sectionMap = {
    "patient-overview": "overview", "patient-doctors": "doctors", "patient-screening": "screening", "patient-chatbot": "chatbot", "patient-timeline": "timeline", "patient-booking": "booking", "patient-payments": "payments", "patient-records": "records", "patient-prescriptions": "prescriptions", "patient-profile": "profile", "patient-settings": "settings",
    "doctor-overview": "overview", "doctor-appointments": "appointments", "doctor-summary": "patient.summary", "doctor-consultation": "consultation.notes", "doctor-prescriptions": "prescriptions", "doctor-records": "records", "doctor-profile": "profile", "doctor-settings": "settings",
    "admin-overview": "overview", "admin-users": "users", "admin-payments": "payments", "admin-analytics": "analytics", "admin-complaints": "complaints", "admin-audit": "audit", "admin-settings": "settings"
  };
  Object.entries(sectionMap).forEach(([section, key]) => {
    qsa(`[data-section='${section}']`).forEach(el => {
      const icon = el.querySelector(".icon")?.outerHTML || "";
      el.innerHTML = `${icon}${escapeHtml(t[key] || t[section.replace(/^\w+-/, "")] || el.textContent.trim())}`;
    });
  });
  qsa("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });
  const titleMap = {
    patient: "patient.dashboard",
    doctor: "doctor.dashboard",
    admin: "admin.dashboard"
  };
  if (currentUser?.role && titleMap[currentUser.role]) {
    const h1 = document.querySelector(".topbar h1");
    if (h1) h1.textContent = t[titleMap[currentUser.role]] || h1.textContent;
  }
  qsa("[data-language-status]").forEach(el => el.textContent = LANGUAGE_META[pack.language]?.name || LANGUAGE_NAMES[pack.language] || pack.language || "English");
  await renderTranslationPreview(pack.language);
  return pack;
}

function applyTheme(theme) {
  const active = theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark-mode", active === "dark");
  document.documentElement.dataset.theme = active;
  localStorage.setItem("telemed_theme", active);
  qsa("#themeSelect").forEach(sel => sel.value = active);
  qsa("[data-theme-status]").forEach(el => el.textContent = active === "dark" ? "Dark mode" : "Light mode");
}

async function loadPreferences() {
  await loadSupportedLanguages();
  const localTheme = localStorage.getItem("telemed_theme") || "light";
  applyTheme(localTheme);
  try {
    const pref = token ? await request("/api/settings/preferences") : { language: localStorage.getItem("telemed_language") || "en", theme: localTheme };
    localStorage.setItem("telemed_language", pref.language || "en");
    applyTheme(pref.theme || localTheme);
    qsa("#languageSelect").forEach(sel => sel.value = pref.language || "en");
    await applyInterfaceTranslations(pref.language || "en");
    return pref;
  } catch (err) {
    await applyInterfaceTranslations(localStorage.getItem("telemed_language") || "en");
    return { language: localStorage.getItem("telemed_language") || "en", theme: localTheme };
  }
}

async function savePreferences() {
  try {
    const language = $("languageSelect")?.value || "en";
    const theme = $("themeSelect")?.value || "light";
    localStorage.setItem("telemed_language", language);
    localStorage.setItem("telemed_theme", theme);
    let pref = { language, theme };
    if (token) {
      pref = await request("/api/settings/preferences", { method: "PUT", body: JSON.stringify({ language, theme }) });
    }
    applyTheme(pref.theme);
    await applyInterfaceTranslations(pref.language);
    setAlert("settingsAlert", "Preferences saved successfully.", "success");
  } catch (err) { setAlert("settingsAlert", err.message, "error"); }
}

async function renderTranslationPreview(lang) {
  const box = $("translationPreview");
  if (!box) return;
  const pack = ACTIVE_TRANSLATIONS && Object.keys(ACTIVE_TRANSLATIONS).length ? ACTIVE_TRANSLATIONS : (await fetchLanguagePack(lang)).translations;
  const keys = ["overview", "appointments", "payments", "records", "prescriptions", "chatbot", "timeline", "settings", "dark.mode", "save.preferences"];
  box.innerHTML = keys.map(k => `<div class="kv"><span>${escapeHtml(k)}</span><strong>${escapeHtml(pack[k] || k)}</strong></div>`).join("");
}

async function testTranslationApi() {
  try {
    const text = $("translateTestInput")?.value || "Book Appointment";
    const target = $("languageSelect")?.value || localStorage.getItem("telemed_language") || "en";
    const result = await request("/api/localization/translate", { method: "POST", body: JSON.stringify({ texts: [text], source_language: "en", target_language: target }) });
    const translated = result.translations[text] || "";
    if ($("translationApiResult")) {
      $("translationApiResult").innerHTML = `<strong>Provider:</strong> ${escapeHtml(result.provider)}<br><strong>Source:</strong> ${escapeHtml(text)}<br><strong>Translated:</strong> ${escapeHtml(translated)}`;
    }
  } catch (err) {
    if ($("translationApiResult")) $("translationApiResult").textContent = err.message;
  }
}

function togglePublicTheme() {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  applyTheme(next);
}

async function toggleGlobalTheme() {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  applyTheme(next);
  try {
    if (token) await request("/api/settings/preferences", { method: "PUT", body: JSON.stringify({ theme: next }) });
  } catch {}
}

function speechToTextToInput(targetId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setAlert("chatbotAlert", "Speech-to-text is not supported in this browser. Use Chrome or Edge.", "error");
    return;
  }
  const lang = $("languageSelect")?.value || localStorage.getItem("telemed_language") || "en";
  const rec = new SpeechRecognition();
  rec.lang = LANGUAGE_META[lang]?.speech_locale || "en-US";
  rec.interimResults = false;
  rec.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const target = $(targetId);
    if (target) target.value = `${target.value ? target.value + " " : ""}${text}`;
  };
  rec.onerror = (event) => setAlert("chatbotAlert", `Speech error: ${event.error}`, "error");
  rec.start();
}

// Initialize theme and public language selector as early as possible on login/signup pages.
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("telemed_theme") || "light");
  if (!token) loadSupportedLanguages().catch(() => {});
});

// ---------------- V4: family booking, full-page translation, availability, reminders ----------------
function formatAvailabilitySlots(slots = []) {
  if (!slots.length) return "No availability set yet.";
  return slots.map(s => `${escapeHtml(s.day_of_week)} ${String(s.start_time).slice(0,5)}–${String(s.end_time).slice(0,5)}`).join("; ");
}

async function getDoctorAvailability(doctorId) {
  if (!doctorId) return null;
  try { return await request(`/api/doctors/${doctorId}/availability`); }
  catch { return null; }
}

loadDoctors = async function() {
  const specialty = $("doctorSearch")?.value?.trim();
  const path = specialty ? `/api/doctors?specialty=${encodeURIComponent(specialty)}` : "/api/doctors";
  const doctors = await request(path);
  const availabilityByDoctor = {};
  await Promise.all(doctors.map(async d => { availabilityByDoctor[d.id] = await getDoctorAvailability(d.id); }));

  if ($("doctorGrid")) {
    $("doctorGrid").innerHTML = doctors.map(d => {
      const av = availabilityByDoctor[d.id];
      const availabilityText = av ? formatAvailabilitySlots(av.slots || []) : "Availability not loaded.";
      const availableBadge = av?.is_available_today ? `<span class="badge success">Available today</span>` : `<span class="badge warning">Check schedule</span>`;
      return `
      <div class="card doctor-card">
        <div class="doctor-top">
          <div class="doctor-avatar">${escapeHtml(d.user?.full_name?.charAt(0) || "D")}</div>
          <div><h3>${escapeHtml(d.user?.full_name || "Doctor")}</h3><span class="badge success">${escapeHtml(d.specialty)}</span> ${availableBadge}</div>
        </div>
        <p>${escapeHtml(d.bio || "Available for online consultation.")}</p>
        <div class="kv"><span>Fee</span><strong>GHS ${Number(d.consultation_fee || 0).toFixed(2)}</strong></div>
        <div class="kv"><span>Experience</span><strong>${d.experience_years || 0} years</strong></div>
        <div class="kv"><span>Languages</span><strong>${escapeHtml(d.languages || "Not specified")}</strong></div>
        <div class="kv"><span>Availability</span><strong>${escapeHtml(availabilityText)}</strong></div>
        <button class="btn block" onclick="selectDoctor('${d.id}', '${escapeHtml(d.user?.full_name || "Doctor")}')">Select Doctor</button>
      </div>`;
    }).join("") || `<div class="empty">No approved doctors found.</div>`;
  }
  const select = $("doctorId");
  if (select) {
    select.innerHTML = doctors.map(d => `<option value="${d.id}">${escapeHtml(d.user?.full_name || "Doctor")} — ${escapeHtml(d.specialty)} — GHS ${d.consultation_fee}</option>`).join("");
    await loadSelectedDoctorAvailability();
  }
  $("statDoctors") && ($("statDoctors").textContent = doctors.length);
  await translateCurrentPageIfNeeded();
  return doctors;
};

selectDoctor = function(id, name) {
  switchSection("patient-booking");
  if ($("doctorId")) $("doctorId").value = id;
  loadSelectedDoctorAvailability();
  setAlert("bookingAlert", `${name} selected. Review availability, screening, and booking details.`, "info");
};

async function loadSelectedDoctorAvailability() {
  const doctorId = $("doctorId")?.value;
  const box = $("selectedDoctorAvailability");
  if (!box || !doctorId) return;
  const av = await getDoctorAvailability(doctorId);
  if (!av) {
    box.className = "alert warning";
    box.textContent = "Could not load doctor availability.";
    return;
  }
  box.className = av.is_available_today ? "alert success" : "alert info";
  box.innerHTML = `<strong>Doctor availability:</strong> ${escapeHtml(formatAvailabilitySlots(av.slots || []))}<br><small>Booking is allowed only within these available days and times.</small>`;
  await translateCurrentPageIfNeeded(box);
}

function toggleOtherPatientFields() {
  const isSelf = ($("bookingForSelf")?.value || "true") === "true";
  qsa(".other-patient-field").forEach(el => { el.style.display = isSelf ? "none" : "block"; });
}

bookAppointment = async function() {
  try {
    const forSelf = ($("bookingForSelf")?.value || "true") === "true";
    const payload = {
      doctor_id: $("doctorId").value,
      ai_screening_id: $("screeningId").value || null,
      appointment_date: $("appointmentDate").value,
      appointment_time: $("appointmentTime").value,
      consultation_type: $("consultationType").value,
      booking_for_self: forSelf,
      patient_display_name: forSelf ? null : ($("otherPatientName")?.value || null),
      patient_relationship: forSelf ? null : ($("otherPatientRelationship")?.value || null),
      patient_age: forSelf ? null : (Number($("otherPatientAge")?.value || 0) || null),
      patient_gender: forSelf ? null : ($("otherPatientGender")?.value || null),
      patient_contact: forSelf ? null : ($("otherPatientContact")?.value || null),
      patient_notes: forSelf ? null : ($("otherPatientNotes")?.value || null)
    };
    const data = await request("/api/appointments", { method: "POST", body: JSON.stringify(payload) });
    if ($("paymentAppointmentId")) $("paymentAppointmentId").value = data.id;
    setAlert("bookingAlert", "Appointment created. The doctor has been notified. Complete payment to confirm.", "success");
    await Promise.allSettled([loadAppointments(), loadNotifications()]);
    switchSection("patient-payments");
  } catch (err) { setAlert("bookingAlert", err.message, "error"); }
};

loadAppointments = async function() {
  const data = await request("/api/appointments");
  setHTML("appointmentsTable", rowTable(["Date", "Time", "For", "Type", "Status", "Payment", "Action"], data.map(a => {
    const forWhom = a.booking_for_self ? "Self" : `${escapeHtml(a.patient_display_name || "Other")}<br><small>${escapeHtml(a.patient_relationship || "Family/Other")}</small>`;
    const action = a.status === "pending_payment"
      ? `<button class="btn secondary" onclick="setPaymentAppointment('${a.id}')">Pay</button>`
      : `<a class="btn ghost" href="${a.consultation_link || `/static/consultation.html?appointment_id=${a.id}`}" target="_blank">Join ${a.consultation_type === "audio" ? "Audio" : "Video"}</a>`;
    return `<tr><td>${a.appointment_date}</td><td>${String(a.appointment_time).slice(0,5)}</td><td>${forWhom}</td><td>${a.consultation_type}</td><td>${badge(a.status)}</td><td>${badge(a.payment_status)}</td><td>${action}</td></tr>`;
  }), "No appointments yet."));
  if ($("appointmentSelect")) $("appointmentSelect").innerHTML = data.map(a => `<option value="${a.id}">${a.appointment_date} ${String(a.appointment_time).slice(0,5)} — ${a.status}</option>`).join("");
  if ($("paymentAppointmentId") && data.find(a => a.status === "pending_payment")) $("paymentAppointmentId").value = data.find(a => a.status === "pending_payment").id;
  $("statAppointments") && ($("statAppointments").textContent = data.length);
  await translateCurrentPageIfNeeded();
  return data;
};

// Enhance preferences: language, dark mode, notification channels, reminder frequency.
loadPreferences = async function() {
  await loadSupportedLanguages();
  const localTheme = localStorage.getItem("telemed_theme") || "light";
  applyTheme(localTheme);
  try {
    const pref = token ? await request("/api/settings/preferences") : { language: localStorage.getItem("telemed_language") || "en", theme: localTheme, email_notifications: true, sms_notifications: true, reminder_frequency: "24h_and_1h" };
    localStorage.setItem("telemed_language", pref.language || "en");
    applyTheme(pref.theme || localTheme);
    qsa("#languageSelect").forEach(sel => sel.value = pref.language || "en");
    qsa("#emailNotifications").forEach(chk => chk.checked = pref.email_notifications !== false);
    qsa("#smsNotifications").forEach(chk => chk.checked = pref.sms_notifications !== false);
    qsa("#reminderFrequency").forEach(sel => sel.value = pref.reminder_frequency || "24h_and_1h");
    await applyInterfaceTranslations(pref.language || "en");
    await translateWholeSystem(pref.language || "en");
    return pref;
  } catch (err) {
    await applyInterfaceTranslations(localStorage.getItem("telemed_language") || "en");
    return { language: localStorage.getItem("telemed_language") || "en", theme: localTheme };
  }
};

savePreferences = async function() {
  try {
    const language = $("languageSelect")?.value || "en";
    const theme = $("themeSelect")?.value || "light";
    const payload = {
      language,
      theme,
      email_notifications: $("emailNotifications") ? $("emailNotifications").checked : true,
      sms_notifications: $("smsNotifications") ? $("smsNotifications").checked : true,
      reminder_frequency: $("reminderFrequency")?.value || "24h_and_1h"
    };
    localStorage.setItem("telemed_language", language);
    localStorage.setItem("telemed_theme", theme);
    let pref = payload;
    if (token) pref = await request("/api/settings/preferences", { method: "PUT", body: JSON.stringify(payload) });
    applyTheme(pref.theme);
    await applyInterfaceTranslations(pref.language);
    await translateWholeSystem(pref.language);
    setAlert("settingsAlert", "Preferences saved successfully. Notifications and reminder settings are now active.", "success");
  } catch (err) { setAlert("settingsAlert", err.message, "error"); }
};

function restoreOriginalPageText(root = document.body) {
  qsa("[data-original-text]").forEach(el => { el.textContent = el.dataset.originalText; });
  qsa("[data-original-placeholder]").forEach(el => { el.setAttribute("placeholder", el.dataset.originalPlaceholder); });
}

function collectTranslatableText(root = document.body) {
  const blocked = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || blocked.has(parent.tagName) || parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue.trim().replace(/\s+/g, " ");
      if (!text || text.length < 2 || text.length > 180) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

async function translateWholeSystem(lang) {
  if (!token) return;
  const language = lang || localStorage.getItem("telemed_language") || "en";
  if (language === "en") { restoreOriginalPageText(); return; }

  const nodes = collectTranslatableText(document.body);
  const originalTexts = [];
  nodes.forEach(node => {
    const parent = node.parentElement;
    if (!parent.dataset.originalText) parent.dataset.originalText = node.nodeValue.trim().replace(/\s+/g, " ");
    originalTexts.push(parent.dataset.originalText);
  });
  qsa("input[placeholder], textarea[placeholder]").forEach(el => {
    if (!el.dataset.originalPlaceholder) el.dataset.originalPlaceholder = el.getAttribute("placeholder") || "";
    if (el.dataset.originalPlaceholder) originalTexts.push(el.dataset.originalPlaceholder);
  });

  const unique = [...new Set(originalTexts.filter(Boolean))].slice(0, 160);
  if (!unique.length) return;
  try {
    const result = await request("/api/localization/translate", { method: "POST", body: JSON.stringify({ texts: unique, source_language: "en", target_language: language }) });
    const map = result.translations || {};
    nodes.forEach(node => {
      const parent = node.parentElement;
      const original = parent.dataset.originalText;
      if (map[original]) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), map[original]);
    });
    qsa("input[placeholder], textarea[placeholder]").forEach(el => {
      const original = el.dataset.originalPlaceholder;
      if (map[original]) el.setAttribute("placeholder", map[original]);
    });
  } catch (err) {
    console.warn("Full-page translation failed", err);
  }
}

async function translateCurrentPageIfNeeded(root = document.body) {
  const lang = localStorage.getItem("telemed_language") || "en";
  if (lang !== "en") await translateWholeSystem(lang);
}

const _switchSectionV4 = switchSection;
switchSection = function(id) {
  _switchSectionV4(id);
  setTimeout(() => translateCurrentPageIfNeeded(), 80);
};

// Keep dynamic areas translated after they render.
["loadPayments", "loadRecords", "loadPrescriptions", "loadNotifications", "loadTimeline", "loadAdminDashboard", "loadAdminUsers", "loadAdminPayments", "loadAdminComplaints", "loadAdminAuditLogs", "loadAdminAnalytics", "loadDoctorAppointments", "loadConsultations", "loadDoctorPrescriptions", "loadDoctorRecords", "loadAvailability"].forEach(fnName => {
  if (typeof window[fnName] === "function") {
    const oldFn = window[fnName];
    window[fnName] = async function(...args) {
      const result = await oldFn.apply(this, args);
      await translateCurrentPageIfNeeded();
      return result;
    };
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    toggleOtherPatientFields();
    const doctorSelect = $("doctorId");
    if (doctorSelect && !doctorSelect.dataset.v4Wired) {
      doctorSelect.addEventListener("change", loadSelectedDoctorAvailability);
      doctorSelect.dataset.v4Wired = "true";
    }
  }, 300);
});


// ---------------- ORIGEN ONE GHANA V5: global branding + full-system translation ----------------
const ORIGEN_BRAND = { name: "ORIGEN ONE GHANA", subtitle: "GOLD COAST", logo_text: "O1" };
const ORIGEN_TEXT_MAP = new WeakMap();
const ORIGEN_PLACEHOLDER_MAP = new WeakMap();
let ORIGEN_TRANSLATING = false;
let ORIGEN_OBSERVER = null;
let ORIGEN_LAST_LANGUAGE = localStorage.getItem("telemed_language") || "en";

async function applyOrigenBranding() {
  try {
    const brand = await fetch(`${API}/api/branding`).then(r => r.json()).catch(() => ORIGEN_BRAND);
    qsa(".logo-mark").forEach(el => el.textContent = brand.logo_text || "O1");
    qsa(".brand-row span").forEach(el => {
      el.innerHTML = `<b>${escapeHtml(brand.name || ORIGEN_BRAND.name)}</b><small>${escapeHtml(brand.subtitle || ORIGEN_BRAND.subtitle)}</small>`;
    });
    document.title = document.title.replace(/MediConnect/g, brand.name || ORIGEN_BRAND.name);
  } catch {}
}

function addPublicLanguageSelector() {
  if ($("publicLanguageSelect") || document.querySelector(".layout")) return;
  const actions = document.querySelector(".hero-actions");
  if (!actions) return;
  const select = document.createElement("select");
  select.id = "publicLanguageSelect";
  select.className = "theme-chip public-language-select";
  select.innerHTML = `<option value="en">English</option><option value="fr">Français</option><option value="tw">Twi</option><option value="ee">Eʋegbe</option><option value="gaa">Ga</option><option value="ha">Hausa</option><option value="ar">العربية</option><option value="es">Español</option><option value="pt">Português</option><option value="sw">Kiswahili</option>`;
  select.value = localStorage.getItem("telemed_language") || "en";
  select.addEventListener("change", async () => {
    localStorage.setItem("telemed_language", select.value);
    ORIGEN_LAST_LANGUAGE = select.value;
    await applyInterfaceTranslations(select.value);
    await translateWholeSystem(select.value, document.body, true);
  });
  actions.appendChild(select);
}

function origenRememberTextNode(node) {
  if (!ORIGEN_TEXT_MAP.has(node)) ORIGEN_TEXT_MAP.set(node, node.nodeValue);
  return ORIGEN_TEXT_MAP.get(node);
}

function origenRememberPlaceholder(el) {
  if (!ORIGEN_PLACEHOLDER_MAP.has(el)) ORIGEN_PLACEHOLDER_MAP.set(el, el.getAttribute("placeholder") || "");
  return ORIGEN_PLACEHOLDER_MAP.get(el);
}

function restoreOriginalPageText(root = document.body) {
  ORIGEN_TEXT_MAP.forEach?.(() => {}); // WeakMap is not iterable; restoration is handled during collection below.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript,[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      return ORIGEN_TEXT_MAP.has(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  while (walker.nextNode()) walker.currentNode.nodeValue = ORIGEN_TEXT_MAP.get(walker.currentNode);
  qsa("input[placeholder], textarea[placeholder], [title]").forEach(el => {
    if (ORIGEN_PLACEHOLDER_MAP.has(el)) {
      if (el.hasAttribute("placeholder")) el.setAttribute("placeholder", ORIGEN_PLACEHOLDER_MAP.get(el));
      if (el.hasAttribute("title")) el.setAttribute("title", ORIGEN_PLACEHOLDER_MAP.get(el));
    }
  });
}

function collectTranslatableText(root = document.body) {
  const blockedTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || blockedTags.has(parent.tagName) || parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      const text = origenRememberTextNode(node).trim().replace(/\s+/g, " ");
      if (!text || text.length < 2 || text.length > 260) return NodeFilter.FILTER_REJECT;
      if (/^[\d\s:/.\-₵$+@]+$/.test(text)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

async function origenTranslateBatch(texts, language) {
  const endpoint = token ? "/api/localization/translate" : "/api/localization/translate-public";
  const unique = [...new Set(texts.filter(Boolean))];
  const translations = {};
  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    const result = await request(endpoint, { method: "POST", body: JSON.stringify({ texts: chunk, source_language: "en", target_language: language }) });
    Object.assign(translations, result.translations || {});
  }
  return translations;
}

async function translateWholeSystem(lang, root = document.body, force = false) {
  const language = lang || localStorage.getItem("telemed_language") || "en";
  ORIGEN_LAST_LANGUAGE = language;
  if (!root || ORIGEN_TRANSLATING) return;
  if (language === "en") { restoreOriginalPageText(root); return; }

  ORIGEN_TRANSLATING = true;
  try {
    const nodes = collectTranslatableText(root);
    const texts = [];
    nodes.forEach(node => texts.push(origenRememberTextNode(node).trim().replace(/\s+/g, " ")));
    qsa("input[placeholder], textarea[placeholder]").forEach(el => {
      const original = origenRememberPlaceholder(el);
      if (original && original.trim().length > 1) texts.push(original.trim().replace(/\s+/g, " "));
    });
    qsa("[title]").forEach(el => {
      const original = origenRememberPlaceholder(el);
      if (original && original.trim().length > 1) texts.push(original.trim().replace(/\s+/g, " "));
    });
    if (!texts.length) return;
    const map = await origenTranslateBatch(texts, language);
    nodes.forEach(node => {
      const original = origenRememberTextNode(node);
      const key = original.trim().replace(/\s+/g, " ");
      if (map[key]) node.nodeValue = original.replace(original.trim(), map[key]);
    });
    qsa("input[placeholder], textarea[placeholder]").forEach(el => {
      const original = origenRememberPlaceholder(el);
      const key = original.trim().replace(/\s+/g, " ");
      if (map[key]) el.setAttribute("placeholder", map[key]);
    });
    qsa("[title]").forEach(el => {
      const original = origenRememberPlaceholder(el);
      const key = original.trim().replace(/\s+/g, " ");
      if (map[key]) el.setAttribute("title", map[key]);
    });
  } catch (err) {
    console.warn("ORIGEN full-system translation failed", err);
  } finally {
    ORIGEN_TRANSLATING = false;
  }
}

async function translateCurrentPageIfNeeded(root = document.body) {
  const lang = localStorage.getItem("telemed_language") || ORIGEN_LAST_LANGUAGE || "en";
  if (lang !== "en") await translateWholeSystem(lang, root);
}

function startOrigenMutationTranslation() {
  if (ORIGEN_OBSERVER) return;
  ORIGEN_OBSERVER = new MutationObserver((mutations) => {
    if (ORIGEN_TRANSLATING || (localStorage.getItem("telemed_language") || "en") === "en") return;
    const changed = mutations.some(m => Array.from(m.addedNodes || []).some(n => n.nodeType === 1 || n.nodeType === 3));
    if (changed) setTimeout(() => translateWholeSystem(localStorage.getItem("telemed_language") || "en"), 200);
  });
  ORIGEN_OBSERVER.observe(document.body, { childList: true, subtree: true });
}

const _origenRequireAuth = requireAuth;
requireAuth = async function(role = null) {
  const ok = await _origenRequireAuth(role);
  if (ok) {
    await applyOrigenBranding();
    await translateWholeSystem(localStorage.getItem("telemed_language") || "en");
    startOrigenMutationTranslation();
  }
  return ok;
};

const _origenLogin = login;
login = async function() {
  await _origenLogin();
};

document.addEventListener("DOMContentLoaded", async () => {
  await applyOrigenBranding();
  addPublicLanguageSelector();
  startOrigenMutationTranslation();
  const lang = localStorage.getItem("telemed_language") || "en";
  await applyInterfaceTranslations(lang).catch(() => {});
  await translateWholeSystem(lang, document.body, true);
});


// ---------------- ORIGEN ONE GHANA V5.1: final full-system translation + patient-facing screening ----------------
// This final layer intentionally overrides earlier partial translation functions.
// It translates all visible interface text, select options, buttons, placeholders, titles, aria labels, image alt text,
// and dynamically rendered API content after dashboards/tables/cards are refreshed.
const ORIGEN_V51_TEXT_ORIGINALS = new WeakMap();
const ORIGEN_V51_ATTR_ORIGINALS = new WeakMap();
let ORIGEN_V51_TRANSLATING = false;
let ORIGEN_V51_DEBOUNCE = null;
let ORIGEN_V51_OBSERVER = null;
let ORIGEN_V51_CACHE = new Map();

function origenV51Language() {
  return localStorage.getItem("telemed_language") || document.querySelector("#languageSelect")?.value || "en";
}

function origenV51IsBlockedElement(el) {
  if (!el || !el.closest) return false;
  return Boolean(el.closest("script,style,noscript,code,pre,[data-no-translate],.logo-mark,.brand-row"));
}

function origenV51ShouldTranslateText(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!clean || clean.length < 2 || clean.length > 450) return false;
  if (/^[\d\s:/.,\-–—₵$+%()#]+$/.test(clean)) return false;
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(clean)) return false;
  if (/^https?:\/\//i.test(clean)) return false;
  if (/^ORIGEN ONE GHANA$/i.test(clean) || /^GOLD COAST$/i.test(clean) || /^O1\+?$/i.test(clean)) return false;
  return true;
}

function origenV51OriginalText(node) {
  if (!ORIGEN_V51_TEXT_ORIGINALS.has(node)) ORIGEN_V51_TEXT_ORIGINALS.set(node, node.nodeValue);
  return ORIGEN_V51_TEXT_ORIGINALS.get(node);
}

function origenV51AttrKey(el, attr) {
  let store = ORIGEN_V51_ATTR_ORIGINALS.get(el);
  if (!store) { store = {}; ORIGEN_V51_ATTR_ORIGINALS.set(el, store); }
  if (!(attr in store)) store[attr] = el.getAttribute(attr) || "";
  return store[attr];
}

function origenV51CollectTextNodes(root = document.body) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || origenV51IsBlockedElement(parent)) return NodeFilter.FILTER_REJECT;
      const original = origenV51OriginalText(node);
      if (!origenV51ShouldTranslateText(original)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function origenV51CollectAttributes(root = document.body) {
  const attrs = [];
  const attrNames = ["placeholder", "title", "aria-label", "alt", "value"];
  const selector = "input[placeholder],textarea[placeholder],[title],[aria-label],img[alt],input[type='button'],input[type='submit'],input[type='reset']";
  Array.from(root.querySelectorAll ? root.querySelectorAll(selector) : []).forEach(el => {
    if (origenV51IsBlockedElement(el)) return;
    attrNames.forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      if (attr === "value" && !/^(button|submit|reset)$/i.test(el.getAttribute("type") || "")) return;
      const original = origenV51AttrKey(el, attr);
      if (origenV51ShouldTranslateText(original)) attrs.push({ el, attr, original });
    });
  });
  return attrs;
}

function origenV51Restore(root = document.body) {
  const nodes = origenV51CollectTextNodes(root);
  nodes.forEach(node => { node.nodeValue = origenV51OriginalText(node); });
  origenV51CollectAttributes(root).forEach(item => item.el.setAttribute(item.attr, item.original));
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
}

async function origenV51TranslateBatch(texts, language) {
  const unique = [...new Set(texts.map(t => String(t || "").trim().replace(/\s+/g, " ")).filter(origenV51ShouldTranslateText))];
  const output = {};
  const missing = [];
  unique.forEach(text => {
    const key = `${language}::${text}`;
    if (ORIGEN_V51_CACHE.has(key)) output[text] = ORIGEN_V51_CACHE.get(key);
    else missing.push(text);
  });
  const endpoint = token ? "/api/localization/translate" : "/api/localization/translate-public";
  for (let i = 0; i < missing.length; i += 60) {
    const chunk = missing.slice(i, i + 60);
    try {
      const result = await request(endpoint, { method: "POST", body: JSON.stringify({ texts: chunk, source_language: "en", target_language: language }) });
      const translations = result.translations || {};
      chunk.forEach(text => {
        const translated = translations[text] || text;
        ORIGEN_V51_CACHE.set(`${language}::${text}`, translated);
        output[text] = translated;
      });
    } catch (err) {
      console.warn("Translation batch failed", err);
      chunk.forEach(text => { output[text] = text; });
    }
  }
  return output;
}

async function translateWholeSystem(lang, root = document.body, force = false) {
  const language = lang || origenV51Language();
  localStorage.setItem("telemed_language", language);
  if (!root || ORIGEN_V51_TRANSLATING) return;
  if (language === "en") { origenV51Restore(root); return; }
  ORIGEN_V51_TRANSLATING = true;
  try {
    const pack = await fetchLanguagePack(language).catch(() => null);
    document.documentElement.lang = language;
    document.documentElement.dir = pack?.direction || (language === "ar" ? "rtl" : "ltr");

    const textNodes = origenV51CollectTextNodes(root);
    const attrItems = origenV51CollectAttributes(root);
    const originals = [];
    textNodes.forEach(node => originals.push(origenV51OriginalText(node).trim().replace(/\s+/g, " ")));
    attrItems.forEach(item => originals.push(item.original.trim().replace(/\s+/g, " ")));

    const map = await origenV51TranslateBatch(originals, language);
    textNodes.forEach(node => {
      const original = origenV51OriginalText(node);
      const key = original.trim().replace(/\s+/g, " ");
      if (map[key] && map[key] !== key) node.nodeValue = original.replace(original.trim(), map[key]);
    });
    attrItems.forEach(item => {
      const key = item.original.trim().replace(/\s+/g, " ");
      if (map[key] && map[key] !== key) item.el.setAttribute(item.attr, map[key]);
    });
  } finally {
    ORIGEN_V51_TRANSLATING = false;
  }
}

async function translateCurrentPageIfNeeded(root = document.body) {
  const lang = origenV51Language();
  if (lang !== "en") await translateWholeSystem(lang, root);
}

function origenV51ScheduleTranslate(root = document.body) {
  if (ORIGEN_V51_TRANSLATING || origenV51Language() === "en") return;
  clearTimeout(ORIGEN_V51_DEBOUNCE);
  ORIGEN_V51_DEBOUNCE = setTimeout(() => translateWholeSystem(origenV51Language(), root), 180);
}

function startOrigenMutationTranslation() {
  if (ORIGEN_V51_OBSERVER || !document.body) return;
  ORIGEN_V51_OBSERVER = new MutationObserver((mutations) => {
    if (ORIGEN_V51_TRANSLATING || origenV51Language() === "en") return;
    const changed = mutations.some(m =>
      Array.from(m.addedNodes || []).some(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) ||
      m.type === "characterData"
    );
    if (changed) origenV51ScheduleTranslate(document.body);
  });
  ORIGEN_V51_OBSERVER.observe(document.body, { childList: true, subtree: true, characterData: true });
}

const _origenV51SavePreferences = savePreferences;
savePreferences = async function() {
  await _origenV51SavePreferences();
  const lang = origenV51Language();
  await applyInterfaceTranslations(lang).catch(() => {});
  await translateWholeSystem(lang, document.body, true);
};

const _origenV51SwitchSection = switchSection;
switchSection = function(id) {
  _origenV51SwitchSection(id);
  origenV51ScheduleTranslate(document.body);
};

const _origenV51RunScreening = typeof runScreening === "function" ? runScreening : null;
if (_origenV51RunScreening) {
  runScreening = async function() {
    await _origenV51RunScreening();
    const box = $("screeningSummary") || $("screeningAlert");
    await translateCurrentPageIfNeeded(box || document.body);
  };
}

const _origenV51SendChatbotMessage = typeof sendChatbotMessage === "function" ? sendChatbotMessage : null;
if (_origenV51SendChatbotMessage) {
  sendChatbotMessage = async function() {
    await _origenV51SendChatbotMessage();
    await translateCurrentPageIfNeeded($("chatbotThread") || document.body);
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  qsa(".brand-row,.logo-mark").forEach(el => el.setAttribute("data-no-translate", "true"));
  startOrigenMutationTranslation();
  const lang = origenV51Language();
  await applyInterfaceTranslations(lang).catch(() => {});
  await translateWholeSystem(lang, document.body, true);
});
