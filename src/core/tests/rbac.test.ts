import { rbacGuard } from '../services/rbac/RBACGuard.service';
import { auditTrailService } from '../services/rbac/AuditTrail.service';
import { teamManagementService } from '../services/rbac/TeamManagement.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { receiptTransactionBridge } from '../services/ocr/ReceiptTransactionBridge.service';
import { db } from '../database/db';
import { AuditActor, UserRole, Permission } from '@/shared/types';

export interface RBACTestResultItem {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface RBACTestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: RBACTestResultItem[];
}

export class RBACTestSuite {
  public static async runAll(): Promise<RBACTestSuiteSummary> {
    const startTime = performance.now();
    const results: RBACTestResultItem[] = [];

    const ownerActor: AuditActor = {
      id: 'usr-owner-001',
      name: 'مالك المؤسسة (Owner)',
      role: 'owner',
      email: 'owner@hisabati.app',
    };

    const adminActor: AuditActor = {
      id: 'usr-admin-002',
      name: 'مدير النظام (Admin)',
      role: 'admin',
      email: 'admin@hisabati.app',
    };

    const accountantActor: AuditActor = {
      id: 'usr-acct-003',
      name: 'المحاسب المعتمد (Accountant)',
      role: 'accountant',
      email: 'accountant@hisabati.app',
    };

    const employeeActor: AuditActor = {
      id: 'usr-emp-004',
      name: 'موظف المبيعات (Employee)',
      role: 'employee',
      email: 'employee@hisabati.app',
    };

    const viewerActor: AuditActor = {
      id: 'usr-view-005',
      name: 'المراجع الخارجي (Viewer)',
      role: 'viewer',
      email: 'viewer@hisabati.app',
    };

    let testAccountId = '';

    // Setup temporary test account
    try {
      const testAccount = await accountService.createAccount({
        name: 'حساب اختبار الصلاحيات RBAC',
        phone: '777123456',
        category: 'customer',
        initialBalance: 0,
      });
      testAccountId = testAccount.id;
    } catch (e) {
      console.warn('Test account already exists or created with ID fallback');
    }

    const testCases: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // Test 1: Role Permissions Matrix Verification
      {
        id: 'RBAC-01',
        title: 'Role Permissions Matrix Consistency',
        description: 'التحقق من صحة مصفوفة الصلاحيات لجميع الأدوار الخمسة وتوافقها الدقيق مع التصميم المعماري',
        fn: async () => {
          // Owner has full power
          if (!rbacGuard.hasPermission(ownerActor, 'team:manage_roles')) throw new Error('Owner must have team:manage_roles');
          if (!rbacGuard.hasPermission(ownerActor, 'transactions:delete')) throw new Error('Owner must have transactions:delete');

          // Admin
          if (!rbacGuard.hasPermission(adminActor, 'team:manage_members')) throw new Error('Admin must have team:manage_members');
          if (!rbacGuard.hasPermission(adminActor, 'accounts:create')) throw new Error('Admin must have accounts:create');

          // Accountant
          if (!rbacGuard.hasPermission(accountantActor, 'transactions:create')) throw new Error('Accountant must have transactions:create');
          if (!rbacGuard.hasPermission(accountantActor, 'receipts:convert')) throw new Error('Accountant must have receipts:convert');
          if (rbacGuard.hasPermission(accountantActor, 'team:manage_members')) throw new Error('Accountant MUST NOT have team:manage_members');
          if (rbacGuard.hasPermission(accountantActor, 'team:manage_roles')) throw new Error('Accountant MUST NOT have team:manage_roles');

          // Employee
          if (!rbacGuard.hasPermission(employeeActor, 'transactions:create')) throw new Error('Employee should be allowed to create transaction');
          if (rbacGuard.hasPermission(employeeActor, 'transactions:delete')) throw new Error('Employee MUST NOT be allowed to delete transactions');
          if (rbacGuard.hasPermission(employeeActor, 'transactions:update')) throw new Error('Employee MUST NOT be allowed to update transactions');
          if (rbacGuard.hasPermission(employeeActor, 'receipts:convert')) throw new Error('Employee MUST NOT be allowed to convert receipts');

          // Viewer
          if (!rbacGuard.hasPermission(viewerActor, 'transactions:read')) throw new Error('Viewer must have transactions:read');
          if (rbacGuard.hasPermission(viewerActor, 'transactions:create')) throw new Error('Viewer MUST NOT have transactions:create');
          if (rbacGuard.hasPermission(viewerActor, 'transactions:update')) throw new Error('Viewer MUST NOT have transactions:update');
          if (rbacGuard.hasPermission(viewerActor, 'transactions:delete')) throw new Error('Viewer MUST NOT have transactions:delete');
        },
      },

      // Test 2: Guarded Execution Gate in FinancialTransactionEngine - Block Unauthorized Viewer
      {
        id: 'RBAC-02',
        title: 'Guarded Gate: Prevent Viewer from Creating Transactions',
        description: 'منع المشاهد (Viewer) من إضافة أي قيد مالي في FinancialTransactionEngine مع قفل الحماية الصارم',
        fn: async () => {
          let intercepted = false;
          try {
            await transactionEngine.createTransaction(
              {
                accountId: testAccountId,
                amount: 1500,
                type: 'credit',
                date: new Date().toISOString().split('T')[0],
                note: 'محاولة محظورة من مشاهد',
              },
              viewerActor
            );
          } catch (err: any) {
            intercepted = true;
            if (err.name !== 'PermissionDeniedError' && !err.message.includes('صلاحية')) {
              throw new Error(`Expected PermissionDeniedError, received: ${err.message}`);
            }
          }

          if (!intercepted) {
            throw new Error('Critical Security Failure: Viewer bypassed FinancialTransactionEngine guard!');
          }
        },
      },

      // Test 3: Guarded Execution Gate in FinancialTransactionEngine - Block Employee from Deleting
      {
        id: 'RBAC-03',
        title: 'Guarded Gate: Prevent Employee from Deleting Transactions',
        description: 'منع الموظف (Employee) من حذف أي معاملة مالية مع تسجيل محاولة غير مصرح بها',
        fn: async () => {
          // 1. First create transaction as Accountant
          const trx = await transactionEngine.createTransaction(
            {
              accountId: testAccountId,
              amount: 800,
              type: 'debit',
              date: new Date().toISOString().split('T')[0],
              note: 'معاملة محاسبية قابلة للاختبار',
            },
            accountantActor
          );

          // 2. Attempt deletion as Employee
          let intercepted = false;
          try {
            await transactionEngine.deleteTransaction(trx.id, employeeActor);
          } catch (err: any) {
            intercepted = true;
            if (err.name !== 'PermissionDeniedError' && !err.message.includes('صلاحية')) {
              throw new Error(`Expected PermissionDeniedError, received: ${err.message}`);
            }
          }

          if (!intercepted) {
            throw new Error('Security Failure: Employee was able to delete a transaction!');
          }

          // Clean up as owner
          await transactionEngine.deleteTransaction(trx.id, ownerActor);
        },
      },

      // Test 4: Guarded Execution Gate in Receipt Conversion Bridge - Block Unauthorized Conversion
      {
        id: 'RBAC-04',
        title: 'Guarded Gate: Prevent Viewer from Posting OCR Receipts',
        description: 'منع المشاهد من ترحيل أي فاتورة أو إيصال إلى قيود مالية مع التحقق من Guarded Execution Gate',
        fn: async () => {
          // Switch active actor to viewer
          rbacGuard.setActiveActor(viewerActor);

          let intercepted = false;
          try {
            await receiptTransactionBridge.convertDraftToTransaction({
              draft: {
                id: 'draft-test-fake',
                status: 'draft',
                isConfirmedByUser: true,
                confirmedAt: new Date().toISOString(),
                source: 'ocr_reviewed',
                partyType: 'customer',
                partyName: 'عميل تجريبي',
                invoiceNumber: 'INV-TEST-99',
                subtotal: 200,
                subtotalMinor: 20000,
                tax: 0,
                taxMinor: 0,
                documentType: 'receipt',
                totalAmount: 200,
                totalAmountMinor: 20000,
                currency: 'YER',
                date: '2026-09-01',
                lineItems: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              accountId: testAccountId,
              type: 'credit',
              explicitUserConfirmed: true,
            });
          } catch (err: any) {
            intercepted = true;
            if (err.name !== 'PermissionDeniedError' && !err.message.includes('صلاحية')) {
              throw new Error(`Expected PermissionDeniedError, received: ${err.message}`);
            }
          }

          // Reset active actor to owner
          rbacGuard.setActiveActor(ownerActor);

          if (!intercepted) {
            throw new Error('Security Failure: Viewer was able to convert OCR draft to transaction!');
          }
        },
      },

      // Test 5: Cryptographic Chaining of Audit Trail Entries (SHA-256 Linked Ledger)
      {
        id: 'RBAC-05',
        title: 'Audit Trail: SHA-256 Linked Cryptographic Ledger',
        description: 'التحقق من إنشاء سلاسل التجزئة المتصلة (Linked Hashes) في سجل التدقيق المالي',
        fn: async () => {
          // Log two sequential actions
          const entry1 = await auditTrailService.log({
            actor: accountantActor,
            action: 'TRANSACTION_CREATE',
            targetType: 'transaction',
            targetId: 'trx-test-chain-1',
            riskLevel: 'LOW',
            detailsAr: 'سجل تجريبي رقم 1 لسلسلة التدقيق',
            afterState: { amount: 100 },
          });

          const entry2 = await auditTrailService.log({
            actor: accountantActor,
            action: 'TRANSACTION_UPDATE',
            targetType: 'transaction',
            targetId: 'trx-test-chain-1',
            riskLevel: 'MEDIUM',
            detailsAr: 'سجل تجريبي رقم 2 لسلسلة التدقيق',
            beforeState: { amount: 100 },
            afterState: { amount: 150 },
          });

          if (!entry1.hash || entry1.hash.length !== 64) {
            throw new Error('Entry 1 does not have a valid SHA-256 hash');
          }
          if (!entry2.hash || entry2.hash.length !== 64) {
            throw new Error('Entry 2 does not have a valid SHA-256 hash');
          }

          // In sequential entries, entry2.previousEntryHash MUST match entry1.hash
          if (entry2.previousEntryHash !== entry1.hash) {
            throw new Error(
              `Chain Broken! Entry 2 previousHash (${entry2.previousEntryHash}) != Entry 1 hash (${entry1.hash})`
            );
          }
        },
      },

      // Test 6: Tamper-Resistant Audit Trail Verification Engine
      {
        id: 'RBAC-06',
        title: 'Audit Trail: Tamper Detection & Integrity Verification',
        description: 'التحقق من كشف أي تلاعب أو تعديل غير مصرح به في سجل التدقيق بنظام SHA-256',
        fn: async () => {
          // 1. Initial verification on clean ledger
          const cleanReport = await auditTrailService.verifyIntegrity();
          if (!cleanReport.isValid) {
            throw new Error(`Expected clean audit trail, got invalid: ${cleanReport.messageAr}`);
          }

          // 2. Inject a fake tampered entry
          const fakeTamperedEntry = {
            id: `audit-tampered-${Date.now()}`,
            sequenceNumber: 999999,
            previousEntryHash: 'tampered-fake-hash',
            hash: '0000000000000000000000000000000000000000000000000000000000000000',
            timestamp: new Date().toISOString(),
            actor: viewerActor,
            action: 'TRANSACTION_DELETE' as const,
            targetType: 'transaction' as const,
            targetId: 'fake-target-id',
            detailsAr: 'عملية تلاعب معدلة يدوياً في قاعدة البيانات',
            riskLevel: 'HIGH' as const,
          };

          await db.auditTrail.add(fakeTamperedEntry);

          // 3. Verify that the integrity checker flags the tampering
          const tamperedReport = await auditTrailService.verifyIntegrity();
          if (tamperedReport.isValid) {
            // Clean up before throwing
            await db.auditTrail.delete(fakeTamperedEntry.id);
            throw new Error('Integrity Engine Failure: Tampered entry was NOT detected!');
          }

          // 4. Remove fake tampered entry and verify that integrity is restored
          await db.auditTrail.delete(fakeTamperedEntry.id);
          const restoredReport = await auditTrailService.verifyIntegrity();
          if (!restoredReport.isValid) {
            throw new Error('Expected clean audit trail after removing tampered entry');
          }
        },
      },

      // Test 7: Unauthorized Attempts Logged in Audit Trail
      {
        id: 'RBAC-07',
        title: 'Audit Trail: Security Breach Logging for Denied Access',
        description: 'التأكد من تسجيل محاولات الوصول غير المصرح بها تلقائياً في سجل التدقيق تحت تصنيف أمني',
        fn: async () => {
          // Attempt an unauthorized action by viewer
          try {
            await rbacGuard.assertPermission('system:settings', {
              actor: viewerActor,
              targetType: 'system',
              details: 'محاولة وصول غير مصرح بها للإعدادات',
            });
          } catch {
            // Expected
          }

          // Verify audit log contains SECURITY_UNAUTHORIZED_ATTEMPT
          const recent = await auditTrailService.getRecentEntries(10);
          const securityAttempt = recent.find(
            (e) =>
              e.action === 'SECURITY_UNAUTHORIZED_ATTEMPT' &&
              e.actor.id === viewerActor.id &&
              (e.riskLevel === 'HIGH' || e.riskLevel === 'CRITICAL')
          );

          if (!securityAttempt) {
            throw new Error('Unauthorized attempt was not recorded in audit trail as SECURITY_UNAUTHORIZED_ATTEMPT');
          }
        },
      },

      // Test 8: Team Member Management & Role Escalation Protection
      {
        id: 'RBAC-08',
        title: 'Team Management: Role Assignment & Escalation Protection',
        description: 'التحقق من حماية دور المالك (Owner) ومنع تعديل دوره أو حذفه مع إدارة الأعضاء',
        fn: async () => {
          // Initialize default team
          const { team, members } = await teamManagementService.initializeDefaultTeamIfNeeded();
          const ownerMember = members.find((m) => m.role === 'owner');
          if (!ownerMember) throw new Error('Default team must have an Owner');

          // Attempt to downgrade owner role (must fail)
          let prevented = false;
          try {
            await teamManagementService.updateMemberRole(ownerMember.id, 'viewer', adminActor);
          } catch (err: any) {
            prevented = true;
          }

          if (!prevented) {
            throw new Error('Security Breach: Owner was downgraded by an admin!');
          }

          // Add a new member as Admin
          const newMember = await teamManagementService.addMember(
            {
              name: 'عضو تجريبي للاختبار',
              email: `test-${Date.now()}@domain.com`,
              role: 'accountant',
            },
            adminActor
          );

          if (!newMember.id) throw new Error('Failed to create new team member');

          // Remove the temporary member
          await teamManagementService.removeMember(newMember.id, adminActor);
        },
      },
    ];

    // Execute each test sequentially
    for (const tc of testCases) {
      const tStart = performance.now();
      try {
        await tc.fn();
        results.push({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          passed: true,
          durationMs: performance.now() - tStart,
        });
      } catch (err: any) {
        results.push({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          passed: false,
          error: err?.message || String(err),
          durationMs: performance.now() - tStart,
        });
      }
    }

    // Cleanup test account
    if (testAccountId) {
      try {
        await db.transactions.where('accountId').equals(testAccountId).delete();
        await db.accounts.delete(testAccountId);
      } catch {
        // ignore cleanup errors
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      durationMs: performance.now() - startTime,
      results,
    };
  }
}
