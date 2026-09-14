require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // 👈 LIBRERÍA DE SEGURIDAD NUEVA

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const app = express();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

// Clave secreta para firmar los carnets digitales (NUNCA COMPARTIRLA)
const JWT_SECRET = process.env.JWT_SECRET || 'AlmaCuerpo_Seguridad_Maxima_2026';

app.get('/', (req, res) => {
  res.send('¡El servidor de la estética está funcionando perfecto, optimizado y BLINDADO!');
});

// --- RUTA PÚBLICA DE LOGIN (Aquí se fabrica el Carnet Digital) ---
app.post('/login', async (req, res) => { 
  try { 
    const { usuario, password } = req.body; 
    const user = await prisma.usuario.findUnique({ where: { usuario: usuario } }); 
    
    if (!user || user.password !== password) return res.status(401).json({ error: "Incorrectas" }); 
    
    // Creamos el Token válido por 24 horas
    const token = jwt.sign(
        { id: user.id, rol: user.rol, nombre: user.nombre }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
    
    res.json({ token: token, nombre: user.nombre, rol: user.rol }); 
  } catch (error) { 
    res.status(500).json({ error: "Error de conexión" }); 
  }
});

// 🔥 MIDDLEWARES DE SEGURIDAD (EL POLICÍA DEL SERVIDOR) 🔥
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato esperado: "Bearer TOKEN_AQUI"
    
    if (!token) return res.status(401).json({ error: "Acceso denegado. No hay credenciales." });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido o expirado. Inicia sesión nuevamente." });
        req.user = user; // Guardamos los datos del usuario para el control de roles
        next();
    });
}

function controlDeRoles(req, res, next) {
    const rol = req.user.rol;
    const metodo = req.method; // GET, POST, PUT, DELETE
    const ruta = req.path;

    // 1. REGLA VISUALIZADOR: Si el usuario es solo lectura, bloqueamos todo lo que no sea GET (Ver) 🚫
    if (rol === 'visualizador' || rol === 'lectura') {
        if (metodo !== 'GET') {
            return res.status(403).json({ error: "Modo Solo Lectura. No tienes permisos para modificar, borrar o registrar datos." });
        }
    }

    // 2. REGLA RECEPCIONISTA: Restricciones específicas 🚫
    if (rol === 'recepcionista') {
        if (ruta.startsWith('/usuarios')) {
            return res.status(403).json({ error: "Solo los administradores pueden gestionar accesos." });
        }
        if (ruta.startsWith('/servicios') && metodo !== 'GET') {
            return res.status(403).json({ error: "No tienes permisos para modificar el catálogo de tratamientos." });
        }
    }

    next(); // Si pasa las pruebas, la petición continúa ✅
}

// APLICAMOS LA SEGURIDAD A TODAS LAS RUTAS PRIVADAS DE ABAJO
app.use(verificarToken);
app.use(controlDeRoles);


// --- RUTAS DE SERVICIOS ---
app.get('/servicios', async (req, res) => {
  try {
    const listaDeServicios = await prisma.servicio.findMany();
    res.json(listaDeServicios);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al buscar los servicios" });
  }
});

app.post('/servicios', async (req, res) => {
  try {
    const { nombre, precio, descripcion, duracion } = req.body;
    const nuevoServicio = await prisma.servicio.create({
      data: { nombre, precio: parseFloat(precio) || 0, duracionMin: parseInt(duracion) || 45, descripcion }
    });
    res.json(nuevoServicio);
  } catch (error) { res.status(500).json({ error: "Fallo al crear el servicio" }); }
});

app.put('/servicios/:id', async (req, res) => {
  try {
    const { nombre, precio, duracion, descripcion } = req.body;
    const servicioActualizado = await prisma.servicio.update({
      where: { id: parseInt(req.params.id) },
      data: { nombre, precio: parseFloat(precio) || 0, duracionMin: parseInt(duracion) || 45, descripcion }
    });
    res.json(servicioActualizado);
  } catch (error) { res.status(500).json({ error: "Fallo al actualizar el servicio" }); }
});

// Parche para la nueva función de Promociones de tu catálogo
app.patch('/servicios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id); const data = req.body;
        if(data.precio) data.precio = parseFloat(data.precio);
        if(data.duracion) data.duracionMin = parseInt(data.duracion);
        delete data.duracion;
        res.json(await prisma.servicio.update({ where: { id: id }, data: data }));
    } catch (error) { res.status(500).json({ error: "Fallo al actualizar promoción" }); }
});

app.delete('/servicios/:id', async (req, res) => {
  try {
    await prisma.servicio.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ mensaje: "Servicio eliminado" });
  } catch (error) { res.status(500).json({ error: "Fallo al eliminar" }); }
});

// --- TASA BCV ---
app.get('/tasa-bcv', async (req, res) => {
  try {
    const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!respuesta.ok) throw new Error('API Error');
    const datos = await respuesta.json(); res.json(datos);
  } catch (error) { res.json({ promedio: 36.50 }); }
});

// --- RUTAS DE CLIENTES ---
app.get('/clientes', async (req, res) => {
  try { res.json(await prisma.cliente.findMany()); } catch (error) { res.status(500).json({ error: "Fallo al obtener clientas" }); }
});

app.get('/clientes/:id', async (req, res) => {
  try {
    const expediente = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) } });
    if (expediente) res.json(expediente); else res.status(404).json({ error: "Paciente no encontrada" });
  } catch (error) { res.status(500).json({ error: "Fallo al obtener la ficha" }); }
});

app.post('/clientes', async (req, res) => {
  try {
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const nuevoCliente = await prisma.cliente.create({ data: { nombre, telefono, cedula, edad: edad ? parseInt(edad) : null, alergias, condiciones, notas } });
    res.json(nuevoCliente);
  } catch (error) { res.status(500).json({ mensaje: "Error al crear la clienta" }); }
});

app.put('/clientes/:id', async (req, res) => {
  try {
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const clienteActualizado = await prisma.cliente.update({
      where: { id: parseInt(req.params.id) },
      data: { nombre, telefono, cedula, edad: edad ? parseInt(edad) : null, alergias, condiciones, notas }
    });
    res.json(clienteActualizado);
  } catch (error) { res.status(500).json({ error: "Fallo al actualizar la clienta" }); }
});

app.delete('/clientes/:id', async (req, res) => {
  try {
    const idCliente = parseInt(req.params.id);
    await prisma.cita.deleteMany({ where: { clienteId: idCliente } });
    await prisma.paquetePaciente.deleteMany({ where: { clienteId: idCliente } }); 
    await prisma.cliente.delete({ where: { id: idCliente } });
    res.json({ mensaje: "Paciente eliminada" });
  } catch (error) { res.status(500).json({ error: "Fallo al eliminar el registro" }); }
});

app.get('/clientes/:id/citas', async (req, res) => {
  try {
    const citas = await prisma.cita.findMany({ where: { clienteId: parseInt(req.params.id) }, include: { servicio: true }, orderBy: { fecha: 'desc' } });
    res.json(citas);
  } catch (error) { res.status(500).json({ error: "Error al obtener historial" }); }
});

app.put('/clientes/:id/abonar', async (req, res) => {
    try {
        const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) } });
        const nuevaDeuda = Math.max(0, cliente.deuda - parseFloat(req.body.montoAbono)); 
        const actualizado = await prisma.cliente.update({ where: { id: parseInt(req.params.id) }, data: { deuda: nuevaDeuda } });
        res.json(actualizado);
    } catch (error) { res.status(500).json({ error: 'Error al descontar deuda' }); }
});

app.patch('/clientes/:id/descuento', async (req, res) => {
    try {
        const clienteActualizado = await prisma.cliente.update({ where: { id: parseInt(req.params.id) }, data: { descuentoFijo: parseInt(req.body.descuentoFijo) } });
        res.json(clienteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar descuento' }); }
});

// 🔥 OPTIMIZACIÓN 1: RUTAS DE CITAS INTELIGENTES (FILTRADO POR FECHA) 🔥
app.get('/citas', async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    let filtroBusqueda = {};

    // Si la agenda nos envía fechas de inicio y fin, solo buscamos esas.
    if (inicio && fin) {
        filtroBusqueda = {
            fecha: {
                gte: inicio, // Mayor o igual que la fecha de inicio
                lte: fin     // Menor o igual que la fecha de fin
            }
        };
    }

    const citasObtenidas = await prisma.cita.findMany({ 
        where: filtroBusqueda,
        include: { cliente: true, servicio: true }, 
        orderBy: { hora: 'asc' } 
    });
    
    res.json(citasObtenidas);
  } catch (error) { 
    res.status(500).json({ error: "Error al buscar citas" }); 
  }
});

app.post('/citas', async (req, res) => {
  try {
    const { clienteId, servicioId, fecha, hora, tipo, sesionActual, totalSesiones, extras, cargoSesion } = req.body;
    const nuevaCita = await prisma.cita.create({
      data: {
        clienteId: parseInt(clienteId), servicioId: parseInt(servicioId), fecha, hora, estado: 'Pendiente', tipo: tipo || "unica",
        sesionActual: sesionActual ? parseInt(sesionActual) : null, totalSesiones: totalSesiones ? parseInt(totalSesiones) : null,
        extras: extras || null, cargoSesion: cargoSesion !== undefined && cargoSesion !== null ? parseFloat(cargoSesion) : null
      }
    });
    res.json(nuevaCita);
  } catch (error) { res.status(500).json({ error: `Error: ${error.message}` }); }
});

app.put('/citas/:id/estado', async (req, res) => {
  try {
    const idCita = parseInt(req.params.id);
    const { estado, metodoPago, montoPagado, cargoSesion } = req.body;
    
    if (estado === 'Completada') {
      const cita = await prisma.cita.findUnique({ where: { id: idCita }, include: { cliente: true } });
      const cargo = parseFloat(cargoSesion) || 0; const abono = parseFloat(montoPagado) || 0;
      const nuevaDeuda = Math.max(0, cita.cliente.deuda + cargo - abono);
      await prisma.cliente.update({ where: { id: cita.clienteId }, data: { deuda: nuevaDeuda } });
      const citaActualizada = await prisma.cita.update({ where: { id: idCita }, data: { estado: estado, metodoPago: metodoPago, montoPagado: abono, cargoSesion: cargo } });
      res.json(citaActualizada);
    } else {
      const citaCancelada = await prisma.cita.update({ where: { id: idCita }, data: { estado: estado } });
      res.json(citaCancelada);
    }
  } catch (error) { res.status(500).json({ error: "Fallo al procesar" }); }
});

app.put('/citas/:id/editar', async (req, res) => {
  try {
    const idCita = parseInt(req.params.id);
    const { fecha, hora, servicioId, sesionActual, totalSesiones, extras, cambiarRestantes } = req.body;
    
    const citaVieja = await prisma.cita.findUnique({ where: { id: idCita } });

    const citaActualizada = await prisma.cita.update({
      where: { id: idCita },
      data: { fecha, hora, servicioId: parseInt(servicioId), sesionActual: sesionActual ? parseInt(sesionActual) : null, totalSesiones: totalSesiones ? parseInt(totalSesiones) : null, extras: extras || '' }
    });

    if (cambiarRestantes && citaActualizada.tipo === 'paquete') {
      await prisma.cita.updateMany({
        where: { clienteId: citaActualizada.clienteId, servicioId: citaVieja.servicioId, tipo: 'paquete', estado: 'Pendiente', id: { not: idCita } },
        data: { hora: hora, servicioId: parseInt(servicioId), totalSesiones: totalSesiones ? parseInt(totalSesiones) : null, extras: extras || '' } 
      });
      await prisma.paquetePaciente.updateMany({
          where: { clienteId: citaActualizada.clienteId, servicioId: citaVieja.servicioId, estadoPaquete: 'Activo' },
          data: { servicioId: parseInt(servicioId), totalSesiones: totalSesiones ? parseInt(totalSesiones) : null }
      });
    }
    res.json(citaActualizada);
  } catch (error) { res.status(500).json({ error: "Fallo al editar la información" }); }
});

// --- PAQUETES ---
app.get('/paquetes/cliente/:clienteId', async (req, res) => {
    try { res.json(await prisma.paquetePaciente.findMany({ where: { clienteId: parseInt(req.params.clienteId) }, include: { servicio: true }, orderBy: { id: 'desc' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.post('/paquetes', async (req, res) => {
    try {
        const { fechaCompra, clienteId, servicioId, totalSesiones, precioTotal, estadoPago } = req.body;
        const nuevoPaquete = await prisma.paquetePaciente.create({ data: { fechaCompra, clienteId: parseInt(clienteId), servicioId: parseInt(servicioId), totalSesiones: parseInt(totalSesiones), precioTotal: parseFloat(precioTotal), estadoPago, estadoPaquete: "Activo" } });
        res.json(nuevoPaquete);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.put('/paquetes/usar/:id', async (req, res) => {
    try {
        const paquete = await prisma.paquetePaciente.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!paquete || paquete.estadoPaquete === 'Completado') return res.status(400).json({ error: 'Completado' });
        
        const nuevasSesionesUsadas = paquete.sesionesUsadas + 1;
        const nuevoEstado = nuevasSesionesUsadas >= paquete.totalSesiones ? 'Completado' : paquete.estadoPaquete; 
        
        const paqueteActualizado = await prisma.paquetePaciente.update({ where: { id: parseInt(req.params.id) }, data: { sesionesUsadas: nuevasSesionesUsadas, estadoPaquete: nuevoEstado } });
        res.json(paqueteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.put('/paquetes/pagar/:id', async (req, res) => {
    try { res.json(await prisma.paquetePaciente.update({ where: { id: parseInt(req.params.id) }, data: { estadoPago: 'Pagado' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.put('/paquetes/:id/ajustar', async (req, res) => {
    try {
        const { sesionesUsadas, totalSesiones } = req.body;
        const paquete = await prisma.paquetePaciente.findUnique({ where: { id: parseInt(req.params.id) } });
        
        let nuevoEstado = paquete.estadoPaquete;
        if (parseInt(sesionesUsadas) >= parseInt(totalSesiones)) {
            nuevoEstado = 'Completado';
        } else if (paquete.estadoPaquete === 'Completado') {
            nuevoEstado = 'Activo'; 
        }

        const paqueteActualizado = await prisma.paquetePaciente.update({
            where: { id: parseInt(req.params.id) },
            data: { sesionesUsadas: parseInt(sesionesUsadas), totalSesiones: parseInt(totalSesiones), estadoPaquete: nuevoEstado }
        });
        res.json(paqueteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error al ajustar paquete' }); }
});

app.delete('/paquetes/:id', async (req, res) => {
    try {
        await prisma.paquetePaciente.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Paquete eliminado correctamente' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar paquete' }); }
});

app.delete('/paquetes/:id/limpiar-agenda', async (req, res) => {
    try {
        const paquete = await prisma.paquetePaciente.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!paquete) return res.status(404).json({ error: 'Paquete no encontrado' });

        await prisma.cita.deleteMany({
            where: { clienteId: paquete.clienteId, servicioId: paquete.servicioId, tipo: 'paquete', estado: 'Pendiente' }
        });

        await prisma.paquetePaciente.update({
            where: { id: parseInt(req.params.id) },
            data: { estadoPaquete: 'Acumulador' }
        });

        res.json({ message: 'Agenda liberada y convertido a acumulador' });
    } catch (error) {
        res.status(500).json({ error: 'Error al limpiar agenda' });
    }
});

// --- INGRESOS EXTRAS ---
app.get('/ingresos-extras', async (req, res) => { try { res.json(await prisma.ingresoExtra.findMany()); } catch (error) { res.status(500).json({ error: 'Error' }); }});
app.post('/ingresos-extras', async (req, res) => { try { const { concepto, monto, metodoPago, fecha, hora } = req.body; res.json(await prisma.ingresoExtra.create({ data: { concepto, monto: parseFloat(monto), metodoPago, fecha, hora } })); } catch (error) { res.status(500).json({ error: 'Error' }); }});

// --- CAJA DIARIA ---
app.get('/caja/:fecha', async (req, res) => { try { const caja = await prisma.cajaDiaria.findUnique({ where: { fecha: req.params.fecha } }); res.json(caja || { estado: 'No aperturada' }); } catch (error) { res.status(500).json({ error: 'Error' }); }});
app.post('/caja/abrir', async (req, res) => { try { const { fecha, montoApertura } = req.body; res.json(await prisma.cajaDiaria.create({ data: { fecha, montoApertura: parseFloat(montoApertura), estado: 'Abierta' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }});
app.put('/caja/cerrar/:id', async (req, res) => { try { const { ingresosCalculados, egresosCalculados, montoCierreFisico, diferencia } = req.body; res.json(await prisma.cajaDiaria.update({ where: { id: parseInt(req.params.id) }, data: { ingresosCalculados: parseFloat(ingresosCalculados), egresosCalculados: parseFloat(egresosCalculados) || 0, montoCierreFisico: parseFloat(montoCierreFisico), diferencia: parseFloat(diferencia), estado: 'Cerrada' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }});
app.get('/cajas/historial', async (req, res) => { try { res.json(await prisma.cajaDiaria.findMany({ orderBy: { fecha: 'desc' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }});

// --- GESTION DE USUARIOS Y ROLES ---
app.get('/usuarios', async (req, res) => { try { res.json(await prisma.usuario.findMany({ select: { id: true, nombre: true, usuario: true, rol: true } })); } catch (error) { res.status(500).json({ error: "Error al cargar usuarios" }); }});
app.post('/usuarios', async (req, res) => { 
    try { 
        const { nombre, usuario, password, rol } = req.body; 
        await prisma.usuario.create({ data: { nombre, usuario, password, rol } }); 
        res.json({ mensaje: "Usuario Creado" }); 
    } catch (error) { 
        res.status(500).json({ error: "El nombre de usuario ya existe" }); 
    }
});
app.delete('/usuarios/:id', async (req, res) => { try { await prisma.usuario.delete({ where: { id: parseInt(req.params.id) } }); res.json({ mensaje: "Usuario Eliminado" }); } catch (error) { res.status(500).json({ error: "Error al borrar usuario" }); }});

// Crea el administrador maestro si no existe
async function crearAdminPorDefecto() { try { const adminExiste = await prisma.usuario.findUnique({ where: { usuario: "admin" } }); if (!adminExiste) { await prisma.usuario.create({ data: { nombre: "Alma y Cuerpo", usuario: "admin", password: "admin123", rol: "admin" } }); } } catch (error) {} }
crearAdminPorDefecto(); 

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => { console.log(`Servidor seguro JWT corriendo en puerto ${PUERTO}`); });
