// Este archivo lo va a incluir CADA página interna del panel (dashboard,
// clientes, libros, etc.), siempre después de supabase-config.js.

const empleadoActual = JSON.parse(sessionStorage.getItem('empleado_actual') || 'null');

// true si quien inició sesión es Admin; las demás páginas la usan para decidir
// qué botones mostrar (por ejemplo, "Editar" solo para Admin en Autores).
const esAdmin = !!empleadoActual && empleadoActual.rol === 'admin';

// Si no hay nadie logueado (o cerró la pestaña y perdió la sesión), lo
// regresamos al login antes de que vea cualquier dato.
if (!empleadoActual) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  // Muestra los elementos marcados como "solo Admin" únicamente si el
  // rol del empleado actual es admin. Por default (en el CSS) están ocultos.
  // Para mostrarlos les quitamos la clase "admin-only", que es la que los oculta.
  if (esAdmin) {
    document.querySelectorAll('.admin-only').forEach((el) => {
      el.classList.remove('admin-only');
    });
  }

  // El enlace a Informes se agrega aquí (solo Admin) para no tener que
  // editarlo a mano en cada página del panel.
  if (esAdmin) {
    const nav = document.querySelector('.sidebar nav');
    if (nav && !nav.querySelector('a[href="informes.html"]')) {
      const enlace = document.createElement('a');
      enlace.href = 'informes.html';
      enlace.textContent = 'Informes';
      nav.appendChild(enlace);
    }
  }

  // Rellena el nombre y rol en el encabezado, si la página tiene esos elementos.
  const nombreEl = document.getElementById('nombre-empleado');
  if (nombreEl) nombreEl.textContent = empleadoActual.nombre;

  const rolEl = document.getElementById('rol-empleado');
  if (rolEl) rolEl.textContent = empleadoActual.rol === 'admin' ? 'Administrador' : 'Empleado';

  // Botón de cerrar sesión, si la página tiene uno.
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      sessionStorage.removeItem('empleado_actual');
      window.location.href = 'index.html';
    });
  }
});

// Evita que texto con símbolos como < o > se interprete como código HTML
// cuando lo mostramos en una tabla (protección básica de seguridad).
function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
