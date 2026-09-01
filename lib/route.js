/* ================================================================
   ROUTER — ported from Code.gs route()
   ================================================================ */
const auth = require('./actions/auth');
const pdpa = require('./actions/auth'); // getPdpaStatus/acceptPdpa live in auth.js too
const records = require('./actions/records');
const master = require('./actions/master');
const assignments = require('./actions/assignments');
const survey = require('./actions/survey');
const users = require('./actions/users');
const pagePerms = require('./actions/pagePerms');
const reportTemplates = require('./actions/reportTemplates');
const targets = require('./actions/targets');
const pm = require('./actions/pm');
const checklist = require('./actions/checklist');
const equipmentDocs = require('./actions/equipmentDocs');
const store = require('./actions/store');
const cm = require('./actions/cm');
const misc = require('./actions/misc');

async function route(action, payload) {
  switch (action) {
    // Auth
    case 'login': return auth.actionLogin(payload);
    case 'verifyToken': return auth.actionVerifyToken(payload);
    // PDPA
    case 'getPdpaStatus': return pdpa.actionGetPdpaStatus(payload);
    case 'acceptPdpa': return pdpa.actionAcceptPdpa(payload);
    // Records
    case 'createRecord': return records.actionCreateRecord(payload);
    case 'listRecords': return records.actionListRecords(payload);
    case 'deleteRecord': return records.actionDeleteRecord(payload);
    // Master Data
    case 'saveMaster': return master.actionSaveMaster(payload);
    case 'listMaster': return master.actionListMaster(payload);
    case 'getProgress': return master.actionGetProgress(payload);
    // Assignments (รายการบันทึก)
    case 'saveAssignment': return assignments.actionSaveAssignment(payload);
    case 'listAssignments': return assignments.actionListAssignments(payload);
    case 'completeAssignment': return assignments.actionCompleteAssignment(payload);
    // Survey Assignments (สำรวจภาคสนาม)
    case 'saveSurveyAssignment': return assignments.actionSaveSurveyAssignment(payload);
    case 'listSurveyAssignments': return assignments.actionListSurveyAssignments(payload);
    case 'completeSurveyAssignment': return assignments.actionCompleteSurveyAssignment(payload);
    // Survey
    case 'createSurvey': return survey.actionCreateSurvey(payload);
    case 'listSurvey': return survey.actionListSurvey(payload);
    case 'updateSurvey': return survey.actionUpdateSurvey(payload);
    case 'deleteSurvey': return survey.actionDeleteSurvey(payload);
    // Users
    case 'createUser': return users.actionCreateUser(payload);
    case 'bulkCreateUsers': return users.actionBulkCreateUsers(payload);
    case 'updateUser': return users.actionUpdateUser(payload);
    case 'deleteUser': return users.actionDeleteUser(payload);
    case 'setUserActive': return users.actionSetUserActive(payload);
    case 'listUsers': return users.actionListUsers(payload);
    // Page Permissions
    case 'getPagePerms': return pagePerms.actionGetPagePerms(payload);
    case 'setPagePerms': return pagePerms.actionSetPagePerms(payload);
    // Report Templates
    case 'listReportTemplates': return reportTemplates.actionListReportTemplates(payload);
    case 'saveReportTemplate': return reportTemplates.actionSaveReportTemplate(payload);
    case 'deleteReportTemplate': return reportTemplates.actionDeleteReportTemplate(payload);
    // Report Field Presets
    case 'listReportPresets': return reportTemplates.actionListReportPresets(payload);
    case 'saveReportPreset': return reportTemplates.actionSaveReportPreset(payload);
    // Report Info
    case 'listReportInfo': return reportTemplates.actionListReportInfo(payload);
    case 'saveReportInfo': return reportTemplates.actionSaveReportInfo(payload);
    case 'bulkSaveReportInfo': return reportTemplates.actionBulkSaveReportInfo(payload);
    case 'getCustomerLogoFolderUrl': return reportTemplates.actionGetCustomerLogoFolderUrl(payload);
    // Targets / assign stats
    case 'saveTarget': return targets.actionSaveTarget(payload);
    case 'listTargets': return targets.actionListTargets(payload);
    case 'getAssignStats': return targets.actionGetAssignStats(payload);
    // Preventive Maintenance (PM)
    case 'listPmSchedules': return pm.actionListPmSchedules(payload);
    case 'savePmSchedule': return pm.actionSavePmSchedule(payload);
    case 'deletePmSchedule': return pm.actionDeletePmSchedule(payload);
    case 'listPmWorkOrders': return pm.actionListPmWorkOrders(payload);
    case 'completePmWorkOrder': return pm.actionCompletePmWorkOrder(payload);
    case 'bulkSavePmSchedules': return pm.actionBulkSavePmSchedules(payload);
    case 'assignPmWorkOrder': return pm.actionAssignPmWorkOrder(payload);
    case 'acknowledgePmWorkOrder': return pm.actionAcknowledgePmWorkOrder(payload);
    case 'listUserRoster': return pm.actionListUserRoster(payload);
    // Checklist / WI Template Library
    case 'listChecklistTemplates': return checklist.actionListChecklistTemplates(payload);
    case 'saveChecklistTemplate': return checklist.actionSaveChecklistTemplate(payload);
    case 'deleteChecklistTemplate': return checklist.actionDeleteChecklistTemplate(payload);
    // Equipment Documents
    case 'listEquipmentDocs': return equipmentDocs.actionListEquipmentDocs(payload);
    case 'saveEquipmentDoc': return equipmentDocs.actionSaveEquipmentDoc(payload);
    case 'deleteEquipmentDoc': return equipmentDocs.actionDeleteEquipmentDoc(payload);
    // Store Control (คลังอะไหล่)
    case 'listStoreParts': return store.actionListStoreParts(payload);
    case 'saveStorePart': return store.actionSaveStorePart(payload);
    case 'deleteStorePart': return store.actionDeleteStorePart(payload);
    case 'listStoreTransactions': return store.actionListStoreTransactions(payload);
    case 'requestStoreWithdraw': return store.actionRequestStoreWithdraw(payload);
    case 'requestStoreReturn': return store.actionRequestStoreReturn(payload);
    case 'approveStoreTx': return store.actionApproveStoreTx(payload);
    case 'rejectStoreTx': return store.actionRejectStoreTx(payload);
    case 'adjustStoreStock': return store.actionAdjustStoreStock(payload);
    // Corrective Maintenance (CM)
    case 'listCmTickets': return cm.actionListCmTickets(payload);
    case 'reportCmTicket': return cm.actionReportCmTicket(payload);
    case 'assignCmTicket': return cm.actionAssignCmTicket(payload);
    case 'acknowledgeCmTicket': return cm.actionAcknowledgeCmTicket(payload);
    case 'completeCmTicket': return cm.actionCompleteCmTicket(payload);
    // PDF Report (not ported yet — see lib/actions/misc.js)
    case 'generateReport': return misc.actionGenerateReport(payload, payload._user);
    // Image proxy
    case 'fetchImageAsBase64': return misc.actionFetchImageAsBase64(payload);
    case 'fetchImagesAsBase64Batch': return misc.actionFetchImagesAsBase64Batch(payload);
    default:
      return { ok: false, error: 'UNKNOWN_ACTION', message: `ไม่รู้จัก action: ${action}` };
  }
}

module.exports = { route };
