// 1. Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB2O0glIygIEGqp_Ya6BY5w_lY5OyErLuk",
    authDomain: "tizasalem.firebaseapp.com",
    projectId: "tizasalem",
    storageBucket: "tizasalem.firebasestorage.app",
    messagingSenderId: "1087196212689",
    appId: "1:1087196212689:web:a2c0fef78fabd5082004f0",
    measurementId: "G-Q3PBLZ3WWB"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Referencias a elementos del DOM
const chalkButton = document.getElementById('chalkButton');
const buttonMessage = document.getElementById('buttonMessage');
const totalChalksSpan = document.getElementById('totalChalks');
const mostChalksClassSpan = document.getElementById('mostChalksClass');
const mostChalksCountSpan = document.getElementById('mostChalksCount');
const chalkLogUl = document.getElementById('chalkLog');

// --- Funciones para manejar IDs de usuario únicos ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
function getUserId() {
    let userId = localStorage.getItem('tizasAlemUserId');
    if (!userId) {
        userId = generateUUID();
        localStorage.setItem('tizasAlemUserId', userId);
    }
    return userId;
}

// --- Lógica de tiempo con API externa (Simple y Segura) ---

// Función para obtener la hora actual desde una API externa
async function getServerTime() {
    try {
        const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const data = await response.json();
        return new Date(data.utc_datetime); // Devuelve un objeto Date con la hora UTC
    } catch (error) {
        console.error("Error al obtener la hora del servidor:", error);
        return null; // Devuelve null si falla la API
    }
}

// Función para verificar si estamos en horario de ALEM usando la hora del servidor
function isInAlemHours(serverDate) {
    // Convertir la hora UTC a la zona horaria de España (o la que necesites)
    const now = new Date(serverDate.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
    
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    const isTuesday = day === 2 && ((hours === 12 && minutes >= 30) || (hours === 13 && minutes < 30));
    const isThursday = day === 4 && ((hours === 11 && minutes >= 30) || (hours === 12) || (hours === 13 && minutes < 30));
    
    return isTuesday || isThursday;
}

// Actualiza el estado del botón usando la hora del servidor
async function updateButtonState() {
    const serverTime = await getServerTime();
    if (serverTime) { // Si la llamada a la API fue exitosa
        if (isInAlemHours(serverTime)) {
            chalkButton.disabled = false;
            buttonMessage.textContent = '¡Hora de romper tizas!';
            buttonMessage.className = 'message success';
        } else {
            chalkButton.disabled = true;
            buttonMessage.textContent = 'El botón solo está activo durante los horarios de ALEM.';
            buttonMessage.className = 'message';
        }
    } else { // Si falló la llamada a la API, deshabilita el botón por seguridad
        chalkButton.disabled = true;
        buttonMessage.textContent = 'No se pudo verificar la hora. Intenta recargar la página.';
        buttonMessage.className = 'message';
    }
}

// --- Listeners de Firebase para actualizar la UI en tiempo real ---
db.collection('stats').doc('global').onSnapshot(doc => {
    if (doc.exists) {
        const data = doc.data();
        totalChalksSpan.textContent = data.totalChalks || 0;
        let mostClass = 'N/A', mostCount = 0;
        if (data.chalksByClass) {
            for (const className in data.chalksByClass) {
                if (data.chalksByClass[className] > mostCount) {
                    mostCount = data.chalksByClass[className];
                    mostClass = className;
                }
            }
        }
        mostChalksClassSpan.textContent = mostClass;
        mostChalksCountSpan.textContent = mostCount;
    }
});

db.collection('chalk_log').orderBy('timestamp', 'desc').limit(10).onSnapshot(snapshot => {
    chalkLogUl.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.timestamp) { // Asegurarse de que el timestamp no sea nulo
            const date = data.timestamp.toDate();
            const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const formattedTime = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const listItem = document.createElement('li');
            listItem.textContent = `Otra tiza muerta ha sido registrada a las ${formattedTime} del ${formattedDate}. (Clase: ${data.classDate})`;
            chalkLogUl.appendChild(listItem);
        }
    });
});

// Listener para el botón de la tiza
chalkButton.addEventListener('click', async () => {
    if (chalkButton.disabled) return;

    chalkButton.disabled = true;
    buttonMessage.textContent = 'Procesando tu clic...';
    buttonMessage.className = 'message';

    const userId = getUserId();
    const clientNow = new Date(); // Hora local solo para referencia de consultas
    const fiveMinutesAgo = new Date(clientNow.getTime() - 5 * 60 * 1000);

    try {
        const lastChalkDoc = await db.collection('chalk_log').orderBy('timestamp', 'desc').limit(1).get();
        if (!lastChalkDoc.empty) {
            const lastChalkTime = lastChalkDoc.docs[0].data().timestamp.toDate();
            if (clientNow.getTime() - lastChalkTime.getTime() < 5 * 60 * 1000) {
                buttonMessage.textContent = '¡Calma! No se puede registrar más de una tiza cada 5 minutos.';
                buttonMessage.className = 'message';
                chalkButton.disabled = false;
                return;
            }
        }

        await db.collection('temp_clicks').add({
            userId: userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() // Usar la hora del servidor de Firebase
        });

        const tempClicksRef = db.collection('temp_clicks');
        const recentClicksSnapshot = await tempClicksRef.where('timestamp', '>=', fiveMinutesAgo).get();
        const uniqueUserIds = new Set();
        recentClicksSnapshot.forEach(doc => { uniqueUserIds.add(doc.data().userId); });

        if (uniqueUserIds.size >= 3) {
            const globalStatsRef = db.collection('stats').doc('global');
            await db.runTransaction(async (transaction) => {
                const globalDoc = await transaction.get(globalStatsRef);
                let totalChalks = (globalDoc.exists && globalDoc.data().totalChalks) || 0;
                let chalksByClass = (globalDoc.exists && globalDoc.data().chalksByClass) || {};
                totalChalks++;
                const classDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
                chalksByClass[classDate] = (chalksByClass[classDate] || 0) + 1;

                const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                transaction.set(globalStatsRef, {
                    totalChalks: totalChalks,
                    chalksByClass: chalksByClass,
                    lastChalkTimestamp: serverTimestamp
                });
                await db.collection('chalk_log').add({
                    timestamp: serverTimestamp,
                    userId: userId,
                    classDate: classDate
                });
            });
            buttonMessage.textContent = '¡Felicidades! Otra tiza ha sido asesinada.';
            buttonMessage.className = 'message success';
        } else {
            buttonMessage.textContent = `Faltan ${3 - uniqueUserIds.size} personas para romper la tiza. ¡Ánimo!`;
            buttonMessage.className = 'message';
        }

    } catch (error) {
        console.error('Error al romper la tiza:', error);
        buttonMessage.textContent = 'Ocurrió un error. Revisa la consola para más detalles.';
        buttonMessage.className = 'message';
    } finally {
        chalkButton.disabled = false;
        // Limpieza de clics temporales
        db.collection('temp_clicks').where('timestamp', '<', fiveMinutesAgo).get().then(snapshot => {
            snapshot.forEach(doc => { doc.ref.delete(); });
        });
    }
});

// Inicializar y actualizar periódicamente el estado del botón
updateButtonState();
setInterval(updateButtonState, 60 * 1000); // Actualizar cada minuto
