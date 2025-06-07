// === Módulo de Utilidades de Fechas ===

// Función para formatear una fecha como "YYYY-MM-DD Z"
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} Z`;
  }
  
  // Función para sumar días a una fecha dada
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  
  // Función para calcular la fecha de vencimiento (30 días desde la creación)
  function calculateDueDate(createdAt) {
    const creationDate = new Date(createdAt);
    const dueDate = addDays(creationDate, 30);
    return formatDate(dueDate);
  }
  
  module.exports = { formatDate, calculateDueDate };
  