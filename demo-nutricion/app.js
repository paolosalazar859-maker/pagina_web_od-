// --- Supabase Config ---
const SUPABASE_URL = "https://mtrvicvbtasjzfsdegfa.supabase.co";
const SUPABASE_KEY = "sb_publishable_iP_hKoRhKHo4pRLph9JmJg_9PB0Lqct";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Application State ---
let state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    planningDate: new Date(),
    selectedPlanningDates: [],
    appointments: [],
    profile: JSON.parse(localStorage.getItem('nutriProfile')) || {
        name: "Paolo Salazar",
        specialty: "Nutrición Deportiva",
        email: "contacto@paolo.cl",
        whatsapp: "+56912345678",
        sis: "",
        university: "",
        address: "Consulta Virtual",
        price: "35000",
        bio: "Experto en nutrición deportiva y planes personalizados.",
        availability: {
            weekly: Array(7).fill({m: 'office', s: '09:00', e: '14:00'}),
            blocked: "",
            overrides: {}
        }
    },
    patients: [],
    activePatientId: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("ActualízateNutri initializing...");
    
    // Control de cierre global con ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const historyOverlay = document.getElementById('patient-history-overlay');
            if (historyOverlay && historyOverlay.style.display === 'flex') {
                window.closeHistoryModal();
            }
        }
    });

    // Delegación de Eventos para Botones PDF
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-export-pdf');
        if (btn) {
            const rid = btn.getAttribute('data-record-id');
            if (rid) window.exportToPDF(rid, { currentTarget: btn });
        }

        // --- Botones de Cabecera Historial ---
        if (e.target.closest('.btn-history-export-view')) window.exportViewToPDF();
        if (e.target.closest('.btn-history-print')) window.print();
        if (e.target.closest('.btn-history-close')) window.closeHistoryModal();
    });

    try {
        await init();
        console.log("ActualízateNutri ready (Cloud Sync active)!");
    } catch (e) {
        console.error("Initialization failed:", e);
    }
});

async function init() {
    loadProfile();
    await loadInitialData();
    setupRealtime();
    
    renderCalendar();
    renderAppointments();
    renderPatients();
    renderAvailabilityConfig();
    renderPlanningCalendar();
    updatePlanningSummary(formatDate(state.planningDate));
    setupEventListeners();
    updateDateDisplay();
    if (window.lucide) lucide.createIcons();
    setupRUTMasks();
}

// --- Navigation ---
window.showView = (viewId) => {
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.view === viewId);
    });
};

// --- Planning Logic (Availability Tab) ---
function renderPlanningCalendar() {
    const grid = document.getElementById('planning-grid');
    if (!grid) return;

    const year = state.planningDate.getFullYear();
    const month = state.planningDate.getMonth();
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById('plan-month-name').innerText = `${monthNames[month]} ${year}`;

    // Headers with click action to select columns
    grid.innerHTML = '';
    const dayNames = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"];
    dayNames.forEach((name, i) => {
        const h = document.createElement('div');
        h.className = 'day-name';
        h.style.cursor = 'pointer';
        h.innerText = name;
        h.title = `Seleccionar todos los ${name} del mes`;
        h.onclick = () => selectColumn(i);
        grid.appendChild(h);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < startOffset; i++) {
        grid.appendChild(Object.assign(document.createElement('div'), {className: 'calendar-day empty'}));
    }

    const overrides = state.profile.availability?.overrides || {};
    const weekly = state.profile.availability?.weekly || [];

    let isDragging = false;
    let dragMode = true;

    grid.onmouseleave = () => { isDragging = false; };

    // Function to update visual state without full re-render
    const updateDayUI = (dateStr, shouldSelect) => {
        const dayDiv = grid.querySelector(`[data-date="${dateStr}"]`);
        if (dayDiv) {
            dayDiv.classList.toggle('selected', shouldSelect);
        }
        updateSelectionStatus();
    };

    const setSelection = (dateStr, shouldSelect) => {
        const isIncluded = state.selectedPlanningDates.includes(dateStr);
        if (shouldSelect && !isIncluded) {
            state.selectedPlanningDates.push(dateStr);
            updateDayUI(dateStr, true);
        } else if (!shouldSelect && isIncluded) {
            state.selectedPlanningDates = state.selectedPlanningDates.filter(id => id !== dateStr);
            updateDayUI(dateStr, false);
        }
    };

    window.onmouseup = () => { isDragging = false; };

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dateStr = formatDate(d);
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day planning-day';
        dayDiv.innerText = day;
        dayDiv.dataset.date = dateStr;
        
        let dayIdx = d.getDay();
        let schIdx = dayIdx === 0 ? 6 : dayIdx - 1;
        const config = overrides[dateStr] || weekly[schIdx] || {m: 'off'};
        const modality = config.m;
        
        if (modality === 'office') dayDiv.style.borderLeft = '4px solid var(--primary)';
        if (modality === 'online') dayDiv.style.borderLeft = '4px solid #3b82f6';
        if (modality === 'off') dayDiv.style.borderLeft = '4px solid #94a3b8';
        if (state.selectedPlanningDates.includes(dateStr)) dayDiv.classList.add('selected');

        // Dot indicator for appointments
        const hasApps = state.appointments.some(a => a.date === dateStr);
        if (hasApps) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            dot.style.bottom = '4px';
            dot.style.right = '4px';
            dayDiv.appendChild(dot);
        }

        dayDiv.onmousedown = (e) => { 
            e.preventDefault(); 
            isDragging = true;
            dragMode = !state.selectedPlanningDates.includes(dateStr);
            setSelection(dateStr, dragMode);
            updatePlanningSummary(dateStr);
        };

        dayDiv.onmouseenter = () => { 
            if (isDragging) setSelection(dateStr, dragMode); 
        };

        dayDiv.onclick = (e) => {
            if (!isDragging) updatePlanningSummary(dateStr);
        };
        
        grid.appendChild(dayDiv);
    }
}

window.updatePlanningSummary = (dateStr) => {
    const p = state.profile;
    const d = new Date(dateStr + "T12:00:00"); // Avoid timezone shift
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    
    document.getElementById('plan-selected-date').innerText = d.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Get config for this day
    const overrides = p.availability?.overrides || {};
    const weekly = p.availability?.weekly || [];
    let dayIdx = d.getDay();
    let schIdx = dayIdx === 0 ? 6 : dayIdx - 1;
    const config = overrides[dateStr] || weekly[schIdx] || {m: 'off', s: '09:00', e: '14:00'};

    const apps = state.appointments.filter(a => a.date === dateStr);
    
    // Calculate availability
    const startH = parseInt(config.s.split(':')[0]);
    const endH = parseInt(config.e.split(':')[0]);
    const totalSlots = config.m === 'off' ? 0 : (endH - startH + 1);
    const availableSlots = Math.max(0, totalSlots - apps.length);

    const labels = { office: '🏢 Presencial', online: '💻 Online', off: '❌ Cerrado' };
    
    const stats = document.getElementById('plan-stats');
    stats.innerHTML = `
        <div class="glass-card" style="padding: 0.8rem; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Estado</div>
            <div style="font-weight: 700;">${labels[config.m]}</div>
        </div>
        <div class="glass-card" style="padding: 0.8rem; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Horas Libres</div>
            <div style="font-weight: 700; color: var(--primary);">${availableSlots} / ${totalSlots}</div>
        </div>
    `;

    const list = document.getElementById('plan-appointments-list');
    if (apps.length === 0) {
        list.innerHTML = '<p class="empty-msg">Sin citas en este día.</p>';
    } else {
        list.innerHTML = apps.sort((a,b)=>a.time.localeCompare(b.time)).map(a => `
            <div class="appointment-item" style="margin-bottom: 0.5rem; padding: 0.8rem;">
                <div class="info">
                    <div class="time">${a.time}</div>
                    <div class="pat">${a.patient}</div>
                </div>
            </div>
        `).join('');
    }
};

window.selectColumn = (dayIndex) => {
    const year = state.planningDate.getFullYear();
    const month = state.planningDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        let currentDayIdx = d.getDay();
        let schIdx = currentDayIdx === 0 ? 6 : currentDayIdx - 1;
        
        if (schIdx === dayIndex) {
            const dateStr = formatDate(d);
            if (!state.selectedPlanningDates.includes(dateStr)) {
                state.selectedPlanningDates.push(dateStr);
            }
        }
    }
    renderPlanningCalendar();
    updateSelectionStatus();
};

function updateSelectionStatus() {
    const el = document.getElementById('selection-status');
    const count = state.selectedPlanningDates.length;
    el.innerText = count === 0 ? "Sin días seleccionados" : `${count} días seleccionados`;
}

window.applyBulkModality = (modality) => {
    if (!state.profile.availability) state.profile.availability = { weekly: [], blocked: "", overrides: {} };
    if (!state.profile.availability.overrides) state.profile.availability.overrides = {};

    if (state.selectedPlanningDates.length === 0) {
        alert("Primero selecciona algunos días en el calendario.");
        return;
    }
    
    const startTime = document.getElementById('bulk-start-time').value;
    const endTime = document.getElementById('bulk-end-time').value;

    state.selectedPlanningDates.forEach(dateStr => {
        state.profile.availability.overrides[dateStr] = {
            m: modality,
            s: startTime,
            e: endTime
        };
    });
    
    saveProfile();
    state.selectedPlanningDates = [];
    renderPlanningCalendar();
    updateSelectionStatus();
    
    const labels = { office: 'Presencial 🏢', online: 'Online 💻', off: 'Cerrado ❌' };
    alert(`¡Listo! Se ha aplicado la modalidad ${labels[modality]} (${startTime}-${endTime}) a los días seleccionados.`);
};

window.markAllMonthOff = () => {
    if (!confirm('¿Seguro quieres poner TODO el mes como "CERRADO" para empezar a planificar desde cero?')) return;
    if (!state.profile.availability) state.profile.availability = { weekly: [], blocked: "", overrides: {} };
    if (!state.profile.availability.overrides) state.profile.availability.overrides = {};

    const year = state.planningDate.getFullYear();
    const month = state.planningDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dateStr = formatDate(d);
        state.profile.availability.overrides[dateStr] = { m: 'off', s: '09:00', e: '14:00' };
    }

    saveProfile();
    state.selectedPlanningDates = [];
    renderPlanningCalendar();
    updateSelectionStatus();
    alert('Todo el mes se ha marcado como CERRADO.');
};

window.clearSelection = () => {
    state.selectedPlanningDates = [];
    renderPlanningCalendar();
    updateSelectionStatus();
};

// --- Profile & Persistence ---
function saveProfile() {
    localStorage.setItem('nutriProfile', JSON.stringify(state.profile));
    loadProfile();
}

function loadProfile() {
    const p = state.profile;
    const setters = {
        'header-name': p.name,
        'profile-name-display': p.name,
        'profile-specialty-display': p.specialty,
        'profile-name': p.name,
        'profile-specialty': p.specialty,
        'profile-sis': p.sis || "",
        'profile-university': p.university || "",
        'profile-whatsapp': p.whatsapp || "",
        'profile-price': p.price || "",
        'profile-email': p.email,
        'profile-address': p.address || "",
        'profile-bio': p.bio
    };
    Object.entries(setters).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
            else el.innerText = val;
        }
    });
    const avatar = p.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    ['header-avatar', 'profile-avatar-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = avatar;
    });
    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.innerText = `Hola, ${p.name.split(' ')[0]} 👋`;
}

function renderAvailabilityConfig() {
    const container = document.getElementById('availability-config');
    if (!container) return;
    const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    
    // Migration check
    if (!Array.isArray(state.profile.availability?.weekly) || typeof state.profile.availability.weekly[0] === 'string') {
        state.profile.availability.weekly = Array(7).fill({m: 'office', s: '09:00', e: '14:00'});
    }

    const current = state.profile.availability.weekly;
    
    container.innerHTML = days.map((day, i) => `
        <div class="glass-card" style="padding: 1rem; background: rgba(255,255,255,0.5);">
            <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">${day}</div>
            <select class="avail-mod" data-index="${i}" style="width: 100%; padding: 0.4rem; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 0.5rem;">
                <option value="office" ${current[i].m === 'office' ? 'selected' : ''}>🏢 Presencial</option>
                <option value="online" ${current[i].m === 'online' ? 'selected' : ''}>💻 Online</option>
                <option value="off" ${current[i].m === 'off' ? 'selected' : ''}>❌ Cerrado</option>
            </select>
            <div style="display: flex; align-items: center; gap: 0.3rem;">
                <input type="text" class="avail-start" data-index="${i}" value="${current[i].s || '09:00'}" style="width: 50px; padding: 0.2rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid #ddd;">
                <span style="font-size: 0.7rem;">a</span>
                <input type="text" class="avail-end" data-index="${i}" value="${current[i].e || '14:00'}" style="width: 50px; padding: 0.2rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid #ddd;">
            </div>
        </div>
    `).join('');
}

// --- Dynamic Link ---
window.generateBookingLink = () => {
    const p = state.profile;
    if (!p.whatsapp) { alert("Por favor, ingresa tu número de WhatsApp."); return; }
    
    const mapping = { off: '0', online: '1', office: '2' };
    
    // Weekly
    const weeklyData = daysArray().map(i => {
        const m = document.querySelector(`.avail-mod[data-index="${i}"]`).value;
        const s = document.querySelector(`.avail-start[data-index="${i}"]`).value.replace(':', '');
        const e = document.querySelector(`.avail-end[data-index="${i}"]`).value.replace(':', '');
        return `${mapping[m]}${s}${e}`;
    });
    const schEncoded = weeklyData.join(',');

    // Overrides
    const overrides = p.availability?.overrides || {};
    const ovEncoded = Object.entries(overrides).map(([d, val]) => {
        const dateKey = d.replace(/-/g,'');
        const s = val.s.replace(':', '');
        const e = val.e.replace(':', '');
        return `${dateKey}_${mapping[val.m]}${s}${e}`;
    }).join(',');

    const baseUrl = `https://paolosalazar859-maker.github.io/nutricion/reserva.html`;
    const params = new URLSearchParams({
        wa: p.whatsapp.replace(/\D/g, ''),
        n: p.name,
        s: p.specialty,
        sis: p.sis || "",
        u: p.university || "",
        sch: schEncoded,
        ov: ovEncoded
    });

    const link = `${baseUrl}?${params.toString()}`;
    
    // Copy to clipboard with visual feedback
    const dummy = document.createElement('textarea');
    document.body.appendChild(dummy);
    dummy.value = link;
    dummy.select();
    document.execCommand('copy');
    document.body.removeChild(dummy);
    
    alert("¡Enlace copiado con éxito! Ya puedes pegarlo donde desees.");
};

function daysArray() { return [0,1,2,3,4,5,6]; }

// --- Standard Calendar Logic ---
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const display = document.getElementById('current-month');
    if (display) display.innerText = `${monthNames[month]} ${year}`;
    const headers = Array.from(grid.querySelectorAll('.day-name'));
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startOffset; i++) grid.appendChild(Object.assign(document.createElement('div'), {className: 'calendar-day empty'}));
    const todayStr = formatDate(new Date());
    const selectedStr = formatDate(state.selectedDate);
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerText = day;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr === todayStr) dayDiv.classList.add('today');
        if (dateStr === selectedStr) { dayDiv.style.borderColor = 'var(--primary)'; dayDiv.style.background = 'rgba(109, 40, 217, 0.1)'; }
        if (state.appointments.some(a => a.date === dateStr)) { dayDiv.style.fontWeight = '700'; dayDiv.style.color = 'var(--primary)'; dayDiv.innerHTML += '<div class="dot"></div>'; }
        dayDiv.onclick = () => { state.selectedDate = new Date(year, month, day); renderCalendar(); renderAppointments(); updateDateDisplay(); };
        grid.appendChild(dayDiv);
    }
}

function renderAppointments() {
    const list = document.getElementById('appointments-list');
    if (!list) return;
    const dateStr = formatDate(state.selectedDate);
    const dayApps = state.appointments.filter(a => a.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
    if (dayApps.length === 0) { list.innerHTML = '<p class="empty-msg">No hay citas.</p>'; return; }
    
    list.innerHTML = dayApps.map(app => {
        const p = state.patients.find(x => x.id === app.patient_id);
        const phone = p ? p.phone : '';
        const waLink = phone ? `https://wa.me/${phone.replace(/\+/g,'')}` : '#';
        
        return `
        <div class="appointment-item" style="display: block; padding: 1rem; margin-bottom: 1rem; border: 1px solid #edf2f7; border-radius: 12px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <div>
                    <span class="time" style="font-weight: 800; color: var(--primary); font-size: 1.1rem; display: block;">${app.time}</span>
                    <h4 style="margin: 0.2rem 0; font-size: 1.1rem; color: var(--text-main);">${app.patient_name || 'Paciente'}</h4>
                    ${phone ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">${phone}</p>` : ''}
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    ${phone ? `<a href="${waLink}" target="_blank" class="btn" style="padding: 0.4rem; color: #25d366; border-color: #25d366;"><i data-lucide="message-circle" size="18"></i></a>` : ''}
                    <button class="btn del" style="padding: 0.4rem;" onclick="deleteAppointment('${app.id}')"><i data-lucide="trash-2" size="18"></i></button>
                </div>
            </div>
            ${app.reason ? `<p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted); background: #f8fafc; padding: 0.8rem; border-radius: 8px; border-left: 3px solid var(--primary);">
                <strong>Motivo:</strong> ${app.reason}
            </p>` : ''}
        </div>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// --- Patient & History ---
function renderPatients() {
    const list = document.getElementById('patients-list');
    if (!list) return;
    list.innerHTML = state.patients.map(p => `
        <div class="patient-row">
            <div class="patient-info">
                <h4>${p.name}</h4>
                <p>${window.formatRUT(p.rut)} • ${p.email || p.phone || 'Sin contacto'}</p>
            </div>
            <div class="btns">
                <button class="btn" style="padding: 0.5rem;" onclick="openPatientModal('${p.id}')"><i data-lucide="edit-3" size="16"></i></button>
                <button class="btn" onclick="openHistory('${p.id}')">Historial</button>
                <button class="btn del" onclick="deletePatient('${p.id}')"><i data-lucide="user-minus" size="18"></i></button>
            </div>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

window.openPatientModal = (id = null) => {
    const title = document.getElementById('patient-modal-title');
    const form = document.getElementById('patient-manage-form');
    form.reset();
    document.getElementById('manage-patient-id').value = id || "";

    if (id) {
        title.innerText = "Editar Paciente";
        const p = state.patients.find(x => x.id === id);
        if (p) {
            document.getElementById('manage-patient-name').value = p.name || "";
            document.getElementById('manage-patient-rut').value = p.rut || "";
            document.getElementById('manage-patient-phone').value = p.phone || "";
            document.getElementById('manage-patient-email').value = p.email || "";
            document.getElementById('manage-patient-antecedentes').value = p.antecedentes || "";
        }
    } else {
        title.innerText = "Enrolar Paciente";
    }
    document.getElementById('patient-modal').style.display = 'flex';
};

window.openAddPatientModal = () => openPatientModal();

window.deletePatient = async (id) => { 
    if (confirm('¿Eliminar paciente y todas sus citas?')) { 
        await _supabase.from('patients').delete().eq('id', id);
        loadInitialData();
    } 
};

window.openHistory = async (pid) => { 
    state.activePatientId = pid; 
    const p = state.patients.find(x => x.id === pid); 
    if (!p) return; 
    
    document.getElementById('history-patient-name').innerText = p.name; 
    document.getElementById('history-patient-meta').innerText = `${p.rut ? 'RUT: ' + window.formatRUT(p.rut) + ' • ' : ''}${p.email || p.phone}`; 
    
    // Fetch records
    const { data: recs } = await _supabase.from('history_records').select('*').eq('patient_id', pid);
    p.records = recs || [];
    
    renderHistoryRecords(); 

    // Visualización de Antecedentes Fijos
    const antBox = document.getElementById('history-patient-antecedentes-wrapper');
    const antText = document.getElementById('history-patient-antecedentes');
    if (p.antecedentes) {
        antText.innerText = p.antecedentes;
        antBox.style.display = 'block';
    } else {
        antBox.style.display = 'none';
    }

    document.getElementById('patient-history-overlay').style.display = 'flex'; 
    if (window.lucide) lucide.createIcons();
};

window.closeHistoryModal = () => { document.getElementById('patient-history-overlay').style.display = 'none'; };

function renderHistoryRecords() {
    const p = state.patients.find(x => x.id === state.activePatientId);
    const list = document.getElementById('history-records-list');
    if (!list || !p) return;
    if (!p.records || p.records.length === 0) { list.innerHTML = '<p class="empty-msg">Sin registros previos.</p>'; return; }
    list.innerHTML = p.records.sort((a,b) => b.date.localeCompare(a.date)).map(r => `
        <div class="history-card" style="padding: 1.2rem; border-radius: 12px; border: 1px solid #edf2f7; background: white; margin-bottom: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; margin-bottom: 0.8rem;">
                <span style="font-weight: 800; color: var(--primary);">${r.date}</span>
                <span style="font-size: 0.9rem; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;">IMC: ${r.bmi || '-'}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; font-size: 0.85rem; margin-bottom: 1rem;">
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">Peso</span> <strong>${r.weight}kg</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">Estatura</span> <strong>${r.height || '-'}cm</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">% Grasa</span> <strong>${r.fat || r.fat_pct || '-'}%</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">% Músculo</span> <strong>${r.muscle_pct || '-'}%</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">G. Visceral</span> <strong>${r.visceral_fat || '-'}</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">% Agua</span> <strong>${r.water_pct || '-'}%</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">Cintura</span> <strong>${r.waist || '-'}cm</strong></div>
                <div><span style="color: #64748b; display: block; font-size: 0.7rem;">Cadera</span> <strong>${r.hip || '-'}cm</strong></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #f1f5f9; padding-top: 0.8rem;">
                <div style="flex: 1; font-size: 0.85rem; color: #475569;">
                    ${r.notes ? `<strong>Observaciones:</strong><br>${r.notes}` : ''}
                </div>
                <button class="btn btn-export-pdf" data-record-id="${r.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; display: flex; align-items: center; gap: 5px; background: #f1f5f9; color: var(--primary); border: none;">
                    <i data-lucide="file-text" size="14"></i> PDF
                </button>
            </div>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
    setupRUTMasks(); // Activar máquinas al renderizar registros
}

function setupRUTMasks() {
    const rutFields = ['book-rut', 'manage-patient-rut'];
    rutFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                let value = e.target.value.replace(/[^0-9kK]/g, '');
                if (value.length > 1) {
                    const dv = value.slice(-1);
                    const core = value.slice(0, -1);
                    let formatted = "";
                    for (let i = core.length - 1, j = 0; i >= 0; i--, j++) {
                        formatted = core[i] + (j > 0 && j % 3 === 0 ? "." : "") + formatted;
                    }
                    e.target.value = formatted + "-" + dv;
                } else {
                    e.target.value = value;
                }
            });
        }
    });
}

// --- Data Source Sync ---
async function loadInitialData() {
    const { data: apps } = await _supabase.from('appointments').select('*');
    const { data: pats } = await _supabase.from('patients').select('*');
    
    state.appointments = apps || [];
    state.patients = (pats || []).map(p => ({ ...p, records: [] })); // We fetch records on demand

    // Migrate LocalStorage if cloud is empty
    if (state.appointments.length === 0 && localStorage.getItem('nutriAppointments')) {
        migrateToCloud();
    }
}

function setupRealtime() {
    if (state.realtimeSubscribed) return;
    state.realtimeSubscribed = true; // Bloqueo preventivo instantáneo
    
    _supabase.channel('cloud-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        handleExternalChange(payload, 'appointments');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, (payload) => {
        handleExternalChange(payload, 'patients');
    })
    .subscribe((status) => {
        if (status !== 'SUBSCRIBED') state.realtimeSubscribed = false; // Reset si falla
    });
}

async function handleExternalChange(payload, tableName) {
    if (tableName === 'appointments') {
        if (payload.eventType === 'INSERT') {
            state.appointments.push(payload.new);
        } else if (payload.eventType === 'DELETE') {
            state.appointments = state.appointments.filter(a => a.id !== payload.old.id);
        } else if (payload.eventType === 'UPDATE') {
            const idx = state.appointments.findIndex(a => a.id === payload.new.id);
            if (idx !== -1) state.appointments[idx] = payload.new;
        }
        renderCalendar();
        renderAppointments();
    } else if (tableName === 'patients') {
        if (payload.eventType === 'INSERT') {
            state.patients.push({ ...payload.new, records: [] });
        } else if (payload.eventType === 'DELETE') {
            state.patients = state.patients.filter(p => p.id !== payload.old.id);
        } else if (payload.eventType === 'UPDATE') {
            const idx = state.patients.findIndex(p => p.id === payload.new.id);
            if (idx !== -1) state.patients[idx] = { ...state.patients[idx], ...payload.new };
        }
        renderPatients();
    }
}

async function migrateToCloud() {
    const localApps = JSON.parse(localStorage.getItem('nutriAppointments')) || [];
    if (localApps.length > 0 && confirm("¿Deseas migrar tus citas locales a la nube para que sean visibles desde la web?")) {
        const toUpload = localApps.map(a => ({ patient_name: a.patient, date: a.date, time: a.time, modality: a.type }));
        await _supabase.from('appointments').insert(toUpload);
        loadInitialData();
    }
}

// --- Global Event Listeners ---
function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => { item.onclick = () => showView(item.dataset.view); });
    const addClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    
    addClick('prev-month', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); renderCalendar(); });
    addClick('next-month', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); renderCalendar(); });
    addClick('plan-prev-month', () => { state.planningDate.setMonth(state.planningDate.getMonth() - 1); renderPlanningCalendar(); });
    addClick('plan-next-month', () => { state.planningDate.setMonth(state.planningDate.getMonth() + 1); renderPlanningCalendar(); });

    addClick('open-booking', () => { const i = document.getElementById('appointment-date'); if (i) i.value = formatDate(state.selectedDate); const m = document.getElementById('modal-overlay'); if (m) m.style.display = 'flex'; });
    addClick('close-modal', () => { const m = document.getElementById('modal-overlay'); if (m) m.style.display = 'none'; });

    // History Form & BMI Logic
    const hForm = document.getElementById('history-form');
    
    function updateBMI() {
        const w = parseFloat(document.getElementById('hist-weight').value);
        const h = parseFloat(document.getElementById('hist-height').value) / 100;
        if (w && h) {
            const bmi = (w / (h * h)).toFixed(1);
            document.getElementById('hist-bmi').value = bmi;
        }
    }
    const hwInput = document.getElementById('hist-weight');
    const hhInput = document.getElementById('hist-height');
    if (hwInput) hwInput.oninput = updateBMI;
    if (hhInput) hhInput.oninput = updateBMI;

    if (hForm) hForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.submitter;
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";
        btn.disabled = true;
        
        const getVal = (id) => {
            const val = document.getElementById(id).value;
            return val ? parseFloat(val) : null;
        };

        const trySave = async (payload) => {
            return await _supabase.from('history_records').insert([payload]);
        };

        // Schema-Safe: Nombres de columnas corregidos según el renderizador
        const record = { 
            patient_id: state.activePatientId,
            date: new Date().toISOString().split('T')[0], 
            weight: getVal('hist-weight'), 
            height: getVal('hist-height'),
            bmi: getVal('hist-bmi'),
            fat: getVal('hist-fat'), 
            muscle_pct: getVal('hist-muscle'),
            visceral_fat: getVal('hist-visceral'),
            waist: getVal('hist-waist'),
            hip: getVal('hist-hip'),
            water_pct: getVal('hist-water'),
            notes: document.getElementById('hist-notes').value 
        };

        try {
            if (!record.patient_id) throw new Error("ID de paciente no encontrado. Reintenta.");

            let result = await trySave(record);
            
            // Reintento automático si falla por columnas inexistentes
            if (result.error && (result.error.code.startsWith('P') || result.error.message.includes('column'))) {
                console.warn("Fallo de esquema, reintentando modo básico...");
                result = await trySave({
                    patient_id: record.patient_id,
                    date: record.date,
                    weight: record.weight,
                    height: record.height,
                    bmi: record.bmi,
                    notes: record.notes
                });
            }

            if (result.error) {
                console.error("Supabase Save Error:", result.error);
                alert(`Error Supabase: ${result.error.message}\n(Código: ${result.error.code})`);
            } else {
                alert("¡Evolución guardada con éxito!");
                await window.openHistory(state.activePatientId);
                hForm.reset();
            }
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    const bForm = document.getElementById('booking-form');
    if (bForm) bForm.onsubmit = async (e) => {
        e.preventDefault();
        let patientName = document.getElementById('patient-name').value;
        let patientRut = document.getElementById('book-rut').value.toLowerCase().replace(/\./g,'').replace(/-/g,'');
        
        // 1. Check if we need to Enroll (Create Patient)
        let finalPatientId = null;
        const existing = state.patients.find(p => p.rut === patientRut && patientRut !== "");
        
        if (!existing && patientRut !== "") {
            const { data: pData, error: pError } = await _supabase
                .from('patients')
                .insert([{ name: patientName, rut: patientRut }])
                .select();
            if (pError) { alert("Error al enrolar: " + pError.message); return; }
            finalPatientId = pData[0].id;
            await loadInitialData(); // Update local state
        } else if (existing) {
            finalPatientId = existing.id;
        }

        const app = { 
            patient_id: finalPatientId,
            patient_name: patientName, 
            date: document.getElementById('appointment-date').value, 
            time: document.getElementById('appointment-time').value, 
            modality: document.getElementById('appointment-type').value,
            reason: document.getElementById('appointment-reason').value
        };
        const { error } = await _supabase.from('appointments').insert([app]);
        if (error) alert(error.message);
        document.getElementById('modal-overlay').style.display = 'none';
        bForm.reset();
        document.getElementById('booking-patient-status').innerText = "";
    };

    // Patient Search in Booking
    addClick('search-patient-btn', async () => {
        const rut = document.getElementById('book-rut').value.toLowerCase().replace(/\./g,'').replace(/-/g,'');
        if (!rut) return;
        const p = state.patients.find(x => x.rut === rut);
        const status = document.getElementById('booking-patient-status');
        if (p) {
            document.getElementById('patient-name').value = p.name;
            status.innerText = "✅ Paciente enrolado encontrado";
            status.style.color = "var(--primary)";
        } else {
            status.innerText = "✨ Nuevo paciente (se enrolará al agendar)";
            status.style.color = "#f59e0b";
        }
    });

    // Patient Manage Form
    const pmForm = document.getElementById('patient-manage-form');
    if (pmForm) pmForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('manage-patient-id').value;
        const data = {
            name: document.getElementById('manage-patient-name').value,
            rut: document.getElementById('manage-patient-rut').value.toLowerCase().replace(/\./g,'').replace(/-/g,''),
            phone: document.getElementById('manage-patient-phone').value,
            email: document.getElementById('manage-patient-email').value,
            antecedentes: document.getElementById('manage-patient-antecedentes').value
        };

        let result;
        if (id) {
            result = await _supabase.from('patients').update(data).eq('id', id);
        } else {
            result = await _supabase.from('patients').insert([data]);
        }

        if (result.error) alert(result.error.message);
        else {
            document.getElementById('patient-modal').style.display = 'none';
            await loadInitialData();
            renderPatients();
        }
    };
    addClick('close-patient-modal', () => document.getElementById('patient-modal').style.display = 'none');

    const pForm = document.getElementById('profile-form');
    if (pForm) pForm.onsubmit = (e) => {
        e.preventDefault();
        const weekly = daysArray().map(i => ({
            m: document.querySelector(`.avail-mod[data-index="${i}"]`).value,
            s: document.querySelector(`.avail-start[data-index="${i}"]`).value,
            e: document.querySelector(`.avail-end[data-index="${i}"]`).value
        }));
        state.profile = { ...state.profile, name: document.getElementById('profile-name').value, specialty: document.getElementById('profile-specialty').value, sis: document.getElementById('profile-sis').value, university: document.getElementById('profile-university').value, whatsapp: document.getElementById('profile-whatsapp').value, price: document.getElementById('profile-price').value, email: document.getElementById('profile-email').value, address: document.getElementById('profile-address').value, bio: document.getElementById('profile-bio').value, availability: { ...state.profile.availability, weekly: weekly, blocked: "" } };
        saveProfile();
        alert('Perfil actualizado.');
    };
}

// --- Helpers ---
window.formatRUT = (rut) => {
    if (!rut) return "N/A";
    let value = rut.replace(/[^0-9kK]/g, '');
    if (value.length < 2) return value;
    const dv = value.slice(-1);
    const core = value.slice(0, -1);
    let formatted = "";
    for (let i = core.length - 1, j = 0; i >= 0; i--, j++) {
        formatted = core[i] + (j > 0 && j % 3 === 0 ? "." : "") + formatted;
    }
    return formatted + "-" + dv;
};
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

window.deleteAppointment = async (id) => { 
    if (confirm('¿Eliminar cita?')) { 
        await _supabase.from('appointments').delete().eq('id', id);
    } 
};
function updateDateDisplay() { const el = document.getElementById('selected-date-text'); if (el) el.innerText = state.selectedDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }

// --- Charts and Evolution ---
let weightChartInstance = null;
let compChartInstance = null;

window.toggleHistoryView = (view) => {
    const listContainer = document.getElementById('history-view-list-container');
    const chartContainer = document.getElementById('history-view-chart-container');
    const listBtn = document.getElementById('view-history-list');
    const chartBtn = document.getElementById('view-history-charts');

    if (view === 'list') {
        listContainer.style.display = 'block';
        chartContainer.style.display = 'none';
        listBtn.classList.add('btn-primary');
        chartBtn.classList.remove('btn-primary');
    } else {
        listContainer.style.display = 'none';
        chartContainer.style.display = 'block';
        listBtn.classList.remove('btn-primary');
        chartBtn.classList.add('btn-primary');
        renderCharts();
    }
    if (window.lucide) lucide.createIcons();
};

function renderCharts() {
    const p = state.patients.find(x => x.id === state.activePatientId);
    if (!p || !p.records || p.records.length === 0) return;

    const canvasW = document.getElementById('weightChart');
    const canvasC = document.getElementById('compChart');
    if (!canvasW || !canvasC) return;

    const data = [...p.records].sort((a,b) => a.date.localeCompare(b.date));
    const labels = data.map(d => d.date);

    if (weightChartInstance) weightChartInstance.destroy();
    if (compChartInstance) compChartInstance.destroy();

    const ctxW = canvasW.getContext('2d');
    weightChartInstance = new Chart(ctxW, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Peso (kg)',
                data: data.map(d => d.weight),
                borderColor: '#6d28d9',
                backgroundColor: 'rgba(109, 40, 217, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, maintainAspectRatio: false }
    });

    const ctxC = canvasC.getContext('2d');
    compChartInstance = new Chart(ctxC, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: '% Grasa', data: data.map(d => d.fat_pct || d.fat), backgroundColor: '#fb7185' },
                { label: '% Músculo', data: data.map(d => d.muscle_pct), backgroundColor: '#4ade80' }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false }
    });
}

// --- PDF Export (Individual Record) ---
window.exportToPDF = async (recordId, event) => {
    let btn = event ? event.currentTarget : null;
    let oldText = btn ? btn.innerHTML : "";
    
    if (btn) {
        btn.innerHTML = "Procesando...";
        btn.disabled = true;
    }

    try {
        console.log("Iniciando exportación PDF para record:", recordId);
        // alert("Iniciando generación de PDF..."); // Diagnóstico

        // 1. Validar Librería
        if (!window.jspdf) {
            alert("Error: Librería jsPDF no encontrada. Reinstala o revisa tu conexión.");
            return;
        }

        const p = state.patients.find(x => x.id === state.activePatientId);
        if (!p) throw new Error("Paciente no seleccionado en el estado global.");
        
        const r = p.records.find(re => re.id == recordId);
        if (!r) throw new Error("No se encontró el registro #" + recordId + " en la ficha del paciente.");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const prof = state.profile;

        // Colores y Estilos Premium
        const primary = [109, 40, 217]; 
        const textGray = [71, 85, 105];
        const divider = [226, 232, 240];

        // --- Generación del Contenido ---
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.text("ActualízateNutri", 20, 25);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Plataforma de Gestión Clínica Integral", 20, 32);

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(prof.name, 190, 18, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(prof.specialty, 190, 23, { align: 'right' });
        if (prof.sis) doc.text(`Registro SIS: ${prof.sis}`, 190, 28, { align: 'right' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("REPORTE DE EVOLUCIÓN ANTROPOMÉTRICA", 105, 55, { align: 'center' });

        doc.setDrawColor(divider[0], divider[1], divider[2]);
        doc.line(20, 65, 190, 65);
        doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.setFontSize(12);
        doc.text("I. DATOS DEL PACIENTE", 20, 75);

        doc.setTextColor(0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Nombre: ${p.name}`, 20, 85);
        doc.text(`RUT: ${p.rut || 'N/A'}`, 110, 85);
        doc.text(`Fecha: ${r.date}`, 20, 92);

        doc.line(20, 115, 190, 115);
        doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.text("II. RESULTADOS ANTROPOMÉTRICOS", 20, 125);
        doc.setTextColor(0);
        
        let currY = 135;
        doc.text(`Peso: ${r.weight} kg`, 20, currY);
        doc.text(`Estatura: ${r.height || 'N/A'} cm`, 80, currY);
        doc.text(`IMC: ${r.bmi || 'N/A'}`, 140, currY);
        
        currY += 10;
        doc.text(`% Grasa: ${r.fat || r.fat_pct || 'N/A'}%`, 20, currY);
        doc.text(`% Músculo: ${r.muscle_pct || 'N/A'}%`, 80, currY);
        doc.text(`G. Visceral: ${r.visceral_fat || 'N/A'}`, 140, currY);

        if (r.notes) {
            doc.line(20, 165, 190, 165);
            doc.setTextColor(primary[0], primary[1], primary[2]);
            doc.text("III. OBSERVACIONES Y PLAN", 20, 175);
            doc.setTextColor(0);
            const notesLines = doc.splitTextToSize(r.notes, 170);
            doc.text(notesLines, 20, 185);
        }

        // Firma
        doc.line(120, 240, 190, 240);
        doc.text(prof.name, 155, 247, { align: 'center' });

        // MÉTODO DE ENTREGA FINAL: Visor Interno (Inmune a bloqueos)
        console.log("Mostrando PDF en visor interno...");
        const pdfDataUri = doc.output('datauristring');
        
        const previewOverlay = document.getElementById('pdf-preview-overlay');
        const previewIframe = document.getElementById('pdf-preview-iframe');
        
        if (previewOverlay && previewIframe) {
            previewIframe.src = pdfDataUri;
            previewOverlay.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        } else {
            // Fallback total
            doc.save(`Ficha_${p.name.replace(/\s+/g, '_')}_${r.date}.pdf`);
        }
        
        console.log("Proceso de previsualización finalizado.");

    } catch (err) {
        console.error("Error Crítico PDF:", err);
        alert("Error al generar PDF: " + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = oldText;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// --- Export Full View (Capture Modal) ---
window.exportViewToPDF = async () => {
    const modal = document.querySelector('#patient-history-overlay .modal');
    if (!modal) return;
    
    // Ocultar botones e inputs antes de capturar
    const elementsToHide = modal.querySelectorAll('.btn, #history-form, .nav-menu, [data-lucide="x"]');
    elementsToHide.forEach(el => el.style.visibility = 'hidden');

    try {
        const canvas = await html2canvas(modal, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        
        // MOSTRAR EN VISOR INTERNO
        const pdfDataUri = pdf.output('datauristring');
        const previewOverlay = document.getElementById('pdf-preview-overlay');
        const previewIframe = document.getElementById('pdf-preview-iframe');
        
        if (previewOverlay && previewIframe) {
            previewIframe.src = pdfDataUri;
            previewOverlay.style.display = 'flex';
        } else {
            pdf.save('Reporte_Clinico_ActualízateNutri.pdf');
        }

    } catch (error) {
        console.error("PDF Export Error:", error);
        alert("Error al generar PDF: " + error.message);
    } finally {
        elementsToHide.forEach(el => el.style.visibility = 'visible');
    }
};

init();
