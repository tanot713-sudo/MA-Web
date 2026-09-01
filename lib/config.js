/* ================================================================
   CONFIG — mirrors the CONFIG object from the old Code.gs
   ================================================================
   SHEET_ID / DRIVE_ROOT_ID default to the same IDs the Apps Script
   version used, so this points at the exact same data by default.
   Override via env vars if you ever want to point at a different
   Sheet/Drive folder (e.g. a staging copy).
   ================================================================ */
const CONFIG = {
  SHEET_ID: process.env.SHEET_ID || '1qnTe3simRhRTcaNdLcBIbslJkzA8yiQR75u7Sk8iuAg',
  DRIVE_ROOT_ID: process.env.DRIVE_ROOT_ID || '1ASSXHrqTR64fL1fqxN9CAuRGx_6tZ5CP',

  SHEETS: {
    USERS: 'Users',
    RECORDS: 'Records',
    MASTER: 'Master',
    SURVEY: 'Survey',
    ASSIGNMENTS: 'Assignments',
    SURVEY_ASSIGNMENTS: 'SurveyAssignments',
    PDPA: 'PDPA',
    TOKENS: 'Tokens',
    LOGS: 'Logs',
    PM_SCHEDULES: 'PmSchedules',
    PM_WORKORDERS: 'PmWorkOrders',
    CHECKLIST_TEMPLATES: 'ChecklistTemplates',
    EQUIPMENT_DOCS: 'EquipmentDocs',
    STORE_PARTS: 'StoreParts',
    STORE_TRANSACTIONS: 'StoreTransactions',
    CM_TICKETS: 'CmTickets',
    PAGE_PERMS: 'PagePerms',
    REPORT_TEMPLATES: 'ReportTemplates',
    REPORT_PRESETS: 'ReportPresets',
    REPORT_INFO: 'ReportInfo'
  },

  FOLDERS: {
    AMR_IMAGES: 'AMR Inspection Images',
    AMR_IMG_EQUIP: 'Equipment Photos',
    AMR_IMG_STICKER: 'Sticker Photos',
    ONSITE_IMAGES: 'AMR Onsite Inspection Images',
    ONSITE_IMG_EQUIP: 'Equipment Photos',
    ONSITE_IMG_STICK: 'Sticker Photos',
    ONSITE_MASTER: 'Onsite master data',
    ONSITE_EXCEL: 'Excel',
    CUSTOMER_LOGOS: 'Customer Logos'
  },

  TOKEN_TTL: 8 * 60 * 60 * 1000,
  PDPA_VERSION: '1.0'
};

module.exports = { CONFIG };
