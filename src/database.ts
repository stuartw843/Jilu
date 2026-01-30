/**
 * Database module - Legacy compatibility layer
 * 
 * This file has been refactored into separate modules in src/database/
 * but maintains the same API for backward compatibility.
 * 
 * All operations are now re-exported from the new modular structure.
 */

export { db, type DatabaseExport } from "./database/index";
