require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const app = express();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('¡El servidor de la estética está funcionando perfecto!');
});

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
      data: {
        nombre,
        precio: parseFloat(precio) || 0,
        duracionMin: parseInt(duracion) || 45,
        descripcion
      }
    });
    res.json(nuevoServicio);
  } catch (error) {
    res.status(500).json({ error: "Fallo al crear el servicio" });
  }
});

app.put('/servicios/:id', async (req, res) => {
  try {
    const { nombre, precio, duracion, descripcion } = req.body;
    const servicioActualizado = await prisma.servicio.update({
      where: { id: parseInt(req.params.id) },
      data: { nombre, precio: parseFloat(precio) || 0, duracionMin: parseInt(duracion) || 45, descripcion }
    });
    res.json(servicioActualizado);
  } catch (error) {
    res.status(500).json({ error: "Fallo al actualizar el servicio" });
  }
});

app.delete('/servicios/:id', async (req, res) => {
  try {
    await prisma.servicio.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ mensaje: "Servicio eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Fallo al eliminar" });
  }
});

// --- TASA BCV ---
app.get('/tasa-bcv', async (req, res) => {
  try {
    const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!respuesta.ok) throw new Error('API Error');
    const datos = await respuesta.json();
    res.json(datos);
  } catch (error) {
    res.json({ promedio: 36.50 }); 
  }
});

// --- RUTAS DE CLIENTES ---
app.get('/clientes', async (req, res) => {
  try {
    const todasLasClientas = await prisma.cliente.findMany();
    res.json(todasLasClientas);
  } catch (error) {
    res.status(500).json({ error: "Fallo al obtener clientas" });
  }
});

app.get('/clientes/:id', async (req, res) => {
  try {
    const expediente = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) } });
    if (expediente) res.json(expediente);
    else res.status(404).json({ error: "Paciente no encontrada" });
  } catch (error) {
    res.status(500).json({ error: "Fallo al obtener la ficha" });
  }
});

app.post('/clientes', async (req, res) => {
  try {
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const nuevoCliente = await prisma.cliente.create({
      data: { nombre, telefono, cedula, edad: edad ? parseInt(edad) : null, alergias, condiciones, notas }
    });
    res.json(nuevoCliente);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al crear la clienta" });
  }
});

app.put('/clientes/:id', async (req, res) => {
  try {
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const clienteActualizado = await prisma.cliente.update({
      where: { id: parseInt(req.params.id) },
      data: { nombre, telefono, cedula, edad: edad ? parseInt(edad) : null, alergias, condiciones, notas }
    });
    res.json(clienteActualizado);
  } catch (error) {
    res.status(500).json({ error: "Fallo al actualizar la clienta" });
  }
});

app.delete('/clientes/:id', async (req, res) => {
  try {
    const idCliente = parseInt(req.params.id);
    await prisma.cita.deleteMany({ where: { clienteId: idCliente } });
    await prisma.paquetePaciente.deleteMany({ where: { clienteId: idCliente } }); // Arreglado para evitar choques
    await prisma.cliente.delete({ where: { id: idCliente } });
    res.json({ mensaje: "Paciente eliminada" });
  } catch (error) {
    res.status(500).json({ error: "Fallo al eliminar el registro" });
  }
});

app.get('/clientes/:id/citas', async (req, res) => {
  try {
    const citas = await prisma.cita.findMany({
      where: { clienteId: parseInt(req.params.id) }, include: { servicio: true }, orderBy: { fecha: 'desc' }
    });
    res.json(citas);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

app.put('/clientes/:id/abonar', async (req, res) => {
    try {
        const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) } });
        const nuevaDeuda = Math.max(0, cliente.deuda - parseFloat(req.body.montoAbono)); 
        const actualizado = await prisma.cliente.update({
            where: { id: parseInt(req.params.id) },
            data: { deuda: nuevaDeuda }
        });
        res.json(actualizado);
    } catch (error) { res.status(500).json({ error: 'Error al descontar deuda' }); }
});

app.patch('/clientes/:id/descuento', async (req, res) => {
    try {
        const clienteActualizado = await prisma.cliente.update({
            where: { id: parseInt(req.params.id) },
            data: { descuentoFijo: parseInt(req.body.descuentoFijo) }
        });
        res.json(clienteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error al actualizar descuento' }); }
});

// --- RUTAS DE CITAS ---
app.get('/citas', async (req, res) => {
  try {
    const todasLasCitas = await prisma.cita.findMany({
      include: { cliente: true, servicio: true }, orderBy: { hora: 'asc' }
    });
    res.json(todasLasCitas);
  } catch (error) {
    res.status(500).json({ error: "Fallo al obtener las citas" });
  }
});

app.post('/citas', async (req, res) => {
  try {
    const { clienteId, servicioId, fecha, hora, tipo, sesionActual, totalSesiones, extras, cargoSesion } = req.body;
    const nuevaCita = await prisma.cita.create({
      data: {
        clienteId: parseInt(clienteId),
        servicioId: parseInt(servicioId),
        fecha: fecha,
        hora: hora,
        estado: 'Pendiente',
        tipo: tipo || "unica",
        sesionActual: sesionActual ? parseInt(sesionActual) : null,
        totalSesiones: totalSesiones ? parseInt(totalSesiones) : null,
        extras: extras || null,
        cargoSesion: cargoSesion !== undefined && cargoSesion !== null ? parseFloat(cargoSesion) : null
      }
    });
    res.json(nuevaCita);
  } catch (error) {
    // ESTE ES EL ESCUDO: Si Prisma falla, te dirá el error exacto en pantalla.
    console.error("❌ Error de Prisma al agendar:", error.message);
    res.status(500).json({ error: `Rechazado por Base de Datos: ${error.message}` });
  }
});

app.put('/citas/:id/estado', async (req, res) => {
  try {
    const idCita = parseInt(req.params.id);
    const { estado, metodoPago, montoPagado, cargoSesion } = req.body;
    
    if (estado === 'Completada') {
      const cita = await prisma.cita.findUnique({ where: { id: idCita }, include: { cliente: true } });
      const cargo = parseFloat(cargoSesion) || 0;
      const abono = parseFloat(montoPagado) || 0;
      const nuevaDeuda = Math.max(0, cita.cliente.deuda + cargo - abono);

      await prisma.cliente.update({ where: { id: cita.clienteId }, data: { deuda: nuevaDeuda } });

      const citaActualizada = await prisma.cita.update({
        where: { id: idCita },
        data: { estado: estado, metodoPago: metodoPago, montoPagado: abono, cargoSesion: cargo }
      });
      res.json(citaActualizada);
    } else {
      const citaCancelada = await prisma.cita.update({ where: { id: idCita }, data: { estado: estado } });
      res.json(citaCancelada);
    }
  } catch (error) {
    res.status(500).json({ error: "Fallo al procesar el pago" });
  }
});

// --- PAQUETES ---
app.get('/paquetes/cliente/:clienteId', async (req, res) => {
    try {
        const paquetes = await prisma.paquetePaciente.findMany({
            where: { clienteId: parseInt(req.params.clienteId) }, include: { servicio: true }
        });
        res.json(paquetes);
    } catch (error) { res.status(500).json({ error: 'Error al obtener paquetes' }); }
});

app.post('/paquetes', async (req, res) => {
    try {
        const { fechaCompra, clienteId, servicioId, totalSesiones, precioTotal, estadoPago } = req.body;
        const nuevoPaquete = await prisma.paquetePaciente.create({
            data: { fechaCompra, clienteId: parseInt(clienteId), servicioId: parseInt(servicioId), totalSesiones: parseInt(totalSesiones), precioTotal: parseFloat(precioTotal), estadoPago, estadoPaquete: "Activo" }
        });
        res.json(nuevoPaquete);
    } catch (error) { res.status(500).json({ error: 'Error al crear el paquete' }); }
});

app.put('/paquetes/usar/:id', async (req, res) => {
    try {
        const paquete = await prisma.paquetePaciente.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!paquete || paquete.estadoPaquete === 'Completado') return res.status(400).json({ error: 'Paquete completado o no existe' });

        const nuevasSesionesUsadas = paquete.sesionesUsadas + 1;
        const nuevoEstado = nuevasSesionesUsadas >= paquete.totalSesiones ? 'Completado' : 'Activo';

        const paqueteActualizado = await prisma.paquetePaciente.update({
            where: { id: parseInt(req.params.id) },
            data: { sesionesUsadas: nuevasSesionesUsadas, estadoPaquete: nuevoEstado }
        });
        res.json(paqueteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error al descontar sesión' }); }
});

app.put('/paquetes/pagar/:id', async (req, res) => {
    try {
        const paqueteActualizado = await prisma.paquetePaciente.update({
            where: { id: parseInt(req.params.id) }, data: { estadoPago: 'Pagado' }
        });
        res.json(paqueteActualizado);
    } catch (error) { res.status(500).json({ error: 'Error al registrar pago del paquete' }); }
});

// --- INGRESOS EXTRAS ---
app.get('/ingresos-extras', async (req, res) => {
    try { res.json(await prisma.ingresoExtra.findMany()); } 
    catch (error) { res.status(500).json({ error: 'Error al obtener ingresos' }); }
});

app.post('/ingresos-extras', async (req, res) => {
    try {
        const { concepto, monto, metodoPago, fecha, hora } = req.body;
        const nuevoIngreso = await prisma.ingresoExtra.create({
            data: { concepto, monto: parseFloat(monto), metodoPago, fecha, hora }
        });
        res.json(nuevoIngreso);
    } catch (error) { res.status(500).json({ error: 'Error al registrar ingreso' }); }
});

// --- BOUTIQUE ---
app.get('/boutique', async (req, res) => {
    try { res.json(await prisma.productoBoutique.findMany()); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.post('/boutique', async (req, res) => {
    try {
        const { nombre, descripcion, precio, stock } = req.body;
        const producto = await prisma.productoBoutique.create({ data: { nombre, descripcion, precio: parseFloat(precio), stock: parseInt(stock) } });
        res.json(producto);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.patch('/boutique/:id', async (req, res) => {
    try {
        const { stock, precio } = req.body;
        const dataToUpdate = {};
        if (stock !== undefined) dataToUpdate.stock = parseInt(stock);
        if (precio !== undefined) dataToUpdate.precio = parseFloat(precio);
        const producto = await prisma.productoBoutique.update({ where: { id: parseInt(req.params.id) }, data: dataToUpdate });
        res.json(producto);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/boutique/:id', async (req, res) => {
    try {
        await prisma.ventaBoutique.deleteMany({ where: { productoId: parseInt(req.params.id) } });
        await prisma.productoBoutique.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Eliminado' });
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.get('/ventas-boutique', async (req, res) => {
    try { res.json(await prisma.ventaBoutique.findMany({ include: { producto: true } })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

app.post('/ventas-boutique', async (req, res) => {
    try {
        const { fecha, productoId, cantidad, totalPagado, metodoPago } = req.body;
        const nuevaVenta = await prisma.ventaBoutique.create({
            data: { fecha, productoId: parseInt(productoId), cantidad: parseInt(cantidad), totalPagado: parseFloat(totalPagado), metodoPago }
        });
        await prisma.productoBoutique.update({ where: { id: parseInt(productoId) }, data: { stock: { decrement: parseInt(cantidad) } } });
        res.json(nuevaVenta);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// --- INVENTARIO ---
app.get('/inventario', async (req, res) => {
    try { res.json(await prisma.inventario.findMany()); } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/inventario', async (req, res) => {
    try {
        const { nombre, cantidad, unidad, stockMinimo } = req.body;
        const item = await prisma.inventario.create({ data: { nombre, cantidad: parseFloat(cantidad), unidad, stockMinimo: parseFloat(stockMinimo) } });
        res.json(item);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.patch('/inventario/:id', async (req, res) => {
    try {
        const item = await prisma.inventario.update({ where: { id: parseInt(req.params.id) }, data: { cantidad: parseFloat(req.body.cantidad) } });
        res.json(item);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/inventario/:id', async (req, res) => {
    try { await prisma.inventario.delete({ where: { id: parseInt(req.params.id) } }); res.json({ message: 'Eliminado' }); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// --- EGRESOS ---
app.get('/egresos', async (req, res) => {
    try { res.json(await prisma.egreso.findMany()); } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/egresos', async (req, res) => {
    try {
        const { fecha, concepto, categoria, montoUSD } = req.body;
        const egreso = await prisma.egreso.create({ data: { fecha, concepto, categoria, montoUSD: parseFloat(montoUSD) } });
        res.json(egreso);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/egresos/:id', async (req, res) => {
    try { await prisma.egreso.delete({ where: { id: parseInt(req.params.id) } }); res.json({ message: 'Eliminado' }); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// --- CAJA DIARIA ---
app.get('/caja/:fecha', async (req, res) => {
    try {
        const caja = await prisma.cajaDiaria.findUnique({ where: { fecha: req.params.fecha } });
        res.json(caja || { estado: 'No aperturada' });
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.post('/caja/abrir', async (req, res) => {
    try {
        const { fecha, montoApertura } = req.body;
        const nuevaCaja = await prisma.cajaDiaria.create({ data: { fecha, montoApertura: parseFloat(montoApertura), estado: 'Abierta' } });
        res.json(nuevaCaja);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.put('/caja/cerrar/:id', async (req, res) => {
    try {
        const { ingresosCalculados, egresosCalculados, montoCierreFisico, diferencia } = req.body;
        const cajaCerrada = await prisma.cajaDiaria.update({
            where: { id: parseInt(req.params.id) },
            data: { ingresosCalculados: parseFloat(ingresosCalculados), egresosCalculados: parseFloat(egresosCalculados), montoCierreFisico: parseFloat(montoCierreFisico), diferencia: parseFloat(diferencia), estado: 'Cerrada' }
        });
        res.json(cajaCerrada);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
});
app.get('/cajas/historial', async (req, res) => {
    try { res.json(await prisma.cajaDiaria.findMany({ orderBy: { fecha: 'desc' } })); } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// --- SEGURIDAD ---
async function crearAdminPorDefecto() {
  try {
    const adminExiste = await prisma.usuario.findUnique({ where: { usuario: "admin" } });
    if (!adminExiste) {
      await prisma.usuario.create({ data: { nombre: "Alma y Cuerpo", usuario: "admin", password: "admin123", rol: "admin" } });
    }
  } catch (error) {}
}
crearAdminPorDefecto(); 

app.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const user = await prisma.usuario.findUnique({ where: { usuario: usuario } });
    if (!user || user.password !== password) return res.status(401).json({ error: "Credenciales incorrectas" });
    res.json({ token: "TICKET_ALMA_Y_CUERPO_" + user.id, nombre: user.nombre, rol: user.rol });
  } catch (error) { res.status(500).json({ error: "Error" }); }
});
app.get('/usuarios', async (req, res) => {
  try { res.json(await prisma.usuario.findMany({ select: { id: true, nombre: true, usuario: true, rol: true } })); } catch (error) { res.status(500).json({ error: "Error" }); }
});
app.post('/usuarios', async (req, res) => {
  try {
    const { nombre, usuario, password, rol } = req.body;
    await prisma.usuario.create({ data: { nombre, usuario, password, rol } });
    res.json({ mensaje: "Creado" });
  } catch (error) { res.status(500).json({ error: "Error" }); }
});
app.delete('/usuarios/:id', async (req, res) => {
  try { await prisma.usuario.delete({ where: { id: parseInt(req.params.id) } }); res.json({ mensaje: "Eliminado" }); } catch (error) { res.status(500).json({ error: "Error" }); }
});

const PUERTO = 3000;
app.listen(PUERTO, () => { console.log(`Servidor en puerto ${PUERTO}`); });
