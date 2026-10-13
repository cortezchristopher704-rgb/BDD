// Página solo para Admin (incluye costos de compras, que el Empleado no debe ver)
if (!esAdmin) {
  window.location.href = 'dashboard.html';
}

const STOCK_BAJO = 5;
const PALETA = ['#BF5B3D', '#E0A458', '#7A9E7E', '#5B7C99', '#9C4A30', '#C9B8A6', '#8A7A6D'];
const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let ventas = [];
let compras = [];
let libros = [];
let lineasFiltradas = [];   // cada renglón de venta dentro del rango (para el CSV)
const graficas = {};        // gráficas ya dibujadas (para poder redibujarlas)

const inputDesde = document.getElementById('desde');
const inputHasta = document.getElementById('hasta');
const toast = document.getElementById('toast');

if (window.Chart) {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = '#8A7A6D';
}

let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 4000);
}

// ---------- Bajar los datos (solo ventas y compras activas) ----------
async function cargarDatos() {
  const [resVentas, resCompras, resLibros] = await Promise.all([
    supabaseClient
      .from('venta')
      .select('id_venta, fecha_venta, cliente(nombre), empleado(nombre), detalle_venta(id_libro, cantidad, precio_unitario, libro(titulo, libro_categoria(categoria(nombre_categoria))))')
      .eq('estatus', 'activo')
      .order('fecha_venta', { ascending: true }),
    supabaseClient
      .from('compra')
      .select('id_compra, fecha_compra, proveedor(nombre_empresa), detalle_compra(cantidad, precio_unitario)')
      .eq('estatus', 'activo'),
    supabaseClient
      .from('libro')
      .select('id_libro, titulo, stock')
      .eq('estatus', 'activo')
      .order('stock', { ascending: true }),
  ]);

  if (resVentas.error || resCompras.error || resLibros.error) {
    mostrarMensaje('No se pudieron cargar los datos del informe.', true);
    return;
  }

  ventas = resVentas.data;
  compras = resCompras.data;
  libros = resLibros.data;
  actualizar();
}

// ---------- Filtro por fechas ----------
function dentroDelRango(textoFecha) {
  const dia = (textoFecha || '').slice(0, 10);   // '2026-08-03T10:15:00' -> '2026-08-03'
  return (!inputDesde.value || dia >= inputDesde.value) &&
         (!inputHasta.value || dia <= inputHasta.value);
}

function formatoFecha(texto) {
  return texto.split('-').reverse().join('/');
}

// ---------- Utilidades de agrupación ----------
// Suma "valor" por cada "clave" y devuelve [[clave, total], ...] de mayor a menor
function sumarPor(items, claveFn, valorFn) {
  const mapa = new Map();
  items.forEach((item) => {
    const clave = claveFn(item);
    mapa.set(clave, (mapa.get(clave) || 0) + valorFn(item));
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function recortar(texto, max = 26) {
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
}

// ---------- Gráficas ----------
function dibujar(idCanvas, configuracion) {
  if (graficas[idCanvas]) graficas[idCanvas].destroy();
  graficas[idCanvas] = new Chart(document.getElementById(idCanvas), configuracion);
}

function graficaBarras(idCanvas, entradas, { horizontal = false, dinero = false } = {}) {
  const eje = horizontal ? 'x' : 'y';
  const completos = entradas.map(([clave]) => clave);

  dibujar(idCanvas, {
    type: 'bar',
    data: {
      labels: completos.map((c) => recortar(String(c))),
      datasets: [{
        data: entradas.map(([, valor]) => valor),
        backgroundColor: '#BF5B3D',
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => completos[items[0].dataIndex],
            label: (ctx) => dinero
              ? formatoMoneda.format(ctx.parsed[eje])
              : ctx.parsed[eje] + ' pzas',
          },
        },
      },
      scales: {
        [eje]: {
          beginAtZero: true,
          ticks: dinero ? { callback: (v) => formatoMoneda.format(v) } : { precision: 0 },
        },
      },
    },
  });
}

function graficaDona(idCanvas, entradas) {
  dibujar(idCanvas, {
    type: 'doughnut',
    data: {
      labels: entradas.map(([clave]) => clave),
      datasets: [{
        data: entradas.map(([, valor]) => valor),
        backgroundColor: entradas.map((_, i) => PALETA[i % PALETA.length]),
        borderWidth: 2,
        borderColor: '#FFFFFF',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatoMoneda.format(ctx.parsed)}` } },
      },
    },
  });
}

// ---------- Calcular todo y dibujarlo ----------
function actualizar() {
  const ventasF = ventas.filter((v) => dentroDelRango(v.fecha_venta));
  const comprasF = compras.filter((c) => dentroDelRango(c.fecha_compra));

  // Un renglón por cada libro vendido, ya con sus datos "aplanados"
  lineasFiltradas = [];
  ventasF.forEach((v) => {
    v.detalle_venta.forEach((d) => {
      const precio = Number(d.precio_unitario);
      lineasFiltradas.push({
        folio: v.id_venta,
        fecha: v.fecha_venta.slice(0, 10),
        cliente: v.cliente ? v.cliente.nombre : 'Mostrador',
        empleado: v.empleado ? v.empleado.nombre : '—',
        libro: d.libro ? d.libro.titulo : 'Libro #' + d.id_libro,
        categorias: d.libro && d.libro.libro_categoria
          ? d.libro.libro_categoria.map((x) => x.categoria && x.categoria.nombre_categoria).filter(Boolean)
          : [],
        cantidad: d.cantidad,
        precio,
        subtotal: d.cantidad * precio,
      });
    });
  });

  // Totales (tarjetas de arriba)
  const totalVendido = lineasFiltradas.reduce((suma, l) => suma + l.subtotal, 0);
  const totalComprado = comprasF.reduce(
    (suma, c) => suma + c.detalle_compra.reduce((s, d) => s + d.cantidad * Number(d.precio_unitario), 0), 0);
  const librosBajos = libros.filter((l) => l.stock <= STOCK_BAJO);

  document.getElementById('kpi-total').textContent = formatoMoneda.format(totalVendido);
  document.getElementById('kpi-ventas').textContent = ventasF.length;
  document.getElementById('kpi-ticket').textContent =
    formatoMoneda.format(ventasF.length ? totalVendido / ventasF.length : 0);
  document.getElementById('kpi-compras').textContent = formatoMoneda.format(totalComprado);
  document.getElementById('kpi-stock').textContent = librosBajos.length;
  document.getElementById('kpi-stock-caja').classList.toggle('alerta', librosBajos.length > 0);

  document.getElementById('rango-texto').textContent =
    (inputDesde.value || inputHasta.value)
      ? `Mostrando ${inputDesde.value ? 'desde ' + formatoFecha(inputDesde.value) : 'desde el inicio'} ` +
        `${inputHasta.value ? 'hasta ' + formatoFecha(inputHasta.value) : 'hasta hoy'}. Solo ventas y compras activas.`
      : 'Mostrando todo el periodo. Solo ventas y compras activas.';

  // Gráfica 1: ventas por mes (en orden cronológico)
  const porMes = sumarPor(lineasFiltradas, (l) => l.fecha.slice(0, 7), (l) => l.subtotal)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, total]) => [mes.split('-').reverse().join('/'), total]);
  graficaBarras('g-meses', porMes, { dinero: true });

  // Gráfica 2: top 5 libros más vendidos (unidades)
  graficaBarras('g-libros',
    sumarPor(lineasFiltradas, (l) => l.libro, (l) => l.cantidad).slice(0, 5),
    { horizontal: true });

  // Gráfica 3: ventas por empleado
  graficaBarras('g-empleados',
    sumarPor(lineasFiltradas, (l) => l.empleado, (l) => l.subtotal),
    { horizontal: true, dinero: true });

  // Gráfica 4: ventas por categoría (un libro con 2 categorías cuenta en ambas)
  const porCategoria = new Map();
  lineasFiltradas.forEach((l) => {
    l.categorias.forEach((cat) => porCategoria.set(cat, (porCategoria.get(cat) || 0) + l.subtotal));
  });
  graficaDona('g-categorias', [...porCategoria.entries()].sort((a, b) => b[1] - a[1]));

  // Gráfica 5: compras por proveedor
  const lineasCompra = [];
  comprasF.forEach((c) => {
    const monto = c.detalle_compra.reduce((s, d) => s + d.cantidad * Number(d.precio_unitario), 0);
    lineasCompra.push({ proveedor: c.proveedor ? c.proveedor.nombre_empresa : '—', monto });
  });
  graficaBarras('g-proveedores',
    sumarPor(lineasCompra, (l) => l.proveedor, (l) => l.monto),
    { horizontal: true, dinero: true });

  // Tabla: mejores clientes
  const clientes = new Map();
  lineasFiltradas.forEach((l) => {
    const c = clientes.get(l.cliente) || { total: 0, folios: new Set() };
    c.total += l.subtotal;
    c.folios.add(l.folio);
    clientes.set(l.cliente, c);
  });
  const mejores = [...clientes.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  document.getElementById('t-clientes').innerHTML = mejores.length
    ? mejores.map(([nombre, c]) => `
        <tr>
          <td>${escaparHtml(nombre)}</td>
          <td>${c.folios.size}</td>
          <td><strong>${formatoMoneda.format(c.total)}</strong></td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="empty-state">Sin ventas en este periodo.</td></tr>';

  // Tabla: libros con stock bajo (no depende de las fechas: es el stock de hoy)
  document.getElementById('t-stock').innerHTML = librosBajos.length
    ? librosBajos.slice(0, 10).map((l) => `
        <tr>
          <td>${escaparHtml(l.titulo)}</td>
          <td class="stock-bajo">${l.stock}</td>
        </tr>`).join('')
    : '<tr><td colspan="2" class="empty-state">Todo el inventario está por encima del mínimo.</td></tr>';
}

// ---------- Botones ----------
inputDesde.addEventListener('change', actualizar);
inputHasta.addEventListener('change', actualizar);

document.getElementById('btn-limpiar').addEventListener('click', () => {
  inputDesde.value = '';
  inputHasta.value = '';
  actualizar();
});

document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

// Si una celda trae comas, comillas o saltos de línea, hay que encerrarla en comillas
function celdaCSV(valor) {
  const texto = String(valor ?? '');
  return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

document.getElementById('btn-csv').addEventListener('click', () => {
  if (lineasFiltradas.length === 0) {
    mostrarMensaje('No hay ventas en este periodo para exportar.', true);
    return;
  }

  const encabezado = ['Folio', 'Fecha', 'Cliente', 'Empleado', 'Libro', 'Cantidad', 'Precio unitario', 'Subtotal'];
  const filas = lineasFiltradas.map((l) => [
    l.folio, l.fecha, l.cliente, l.empleado, l.libro, l.cantidad, l.precio.toFixed(2), l.subtotal.toFixed(2),
  ]);
  const csv = [encabezado, ...filas].map((fila) => fila.map(celdaCSV).join(',')).join('\r\n');

  // El \uFEFF del inicio hace que Excel muestre bien los acentos
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'ventas.csv';
  enlace.click();
  URL.revokeObjectURL(url);
});

if (esAdmin) cargarDatos();
