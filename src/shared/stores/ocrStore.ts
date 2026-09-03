import { create } from 'zustand';
import { OCRResult, StructuredReceiptDraft } from '@/shared/types';
import { EditableReceiptState, ReceiptReviewService } from '@/core/services/ocr/ReceiptReviewService';

interface OCRStoreState {
  // Processing & Scanning State
  isScanning: boolean;
  scanProgress: number; // 0 to 100
  scanError: string | null;

  // Active OCR Result under review
  currentOCRResult: OCRResult | null;
  editableState: EditableReceiptState | null;

  // Review Modal Visibility
  isReviewModalOpen: boolean;
  isScannerModalOpen: boolean;

  // Saved structured drafts in memory (Phase 7-B)
  savedDrafts: StructuredReceiptDraft[];
  selectedDraft: StructuredReceiptDraft | null;

  // Conversion Modal State (Phase 7-C)
  isConversionModalOpen: boolean;
  draftToConvert: StructuredReceiptDraft | null;

  // Actions
  openScannerModal: () => void;
  closeScannerModal: () => void;
  openReviewModal: (ocrResult: OCRResult) => void;
  closeReviewModal: () => void;

  openConversionModal: (draft: StructuredReceiptDraft) => void;
  closeConversionModal: () => void;
  markDraftConverted: (draftId: string, transactionId: string, operationId: string) => void;

  setScanning: (isScanning: boolean, progress?: number) => void;
  setScanError: (error: string | null) => void;

  updateEditableField: <K extends keyof EditableReceiptState>(key: K, value: EditableReceiptState[K]) => void;
  updateLineItem: (index: number, field: string, value: any) => void;
  addLineItem: () => void;
  removeLineItem: (index: number) => void;

  confirmReview: (andOpenConvert?: boolean) => StructuredReceiptDraft;
  resetReview: () => void;

  deleteDraft: (draftId: string) => void;
}

export const useOCRStore = create<OCRStoreState>((set, get) => ({
  isScanning: false,
  scanProgress: 0,
  scanError: null,

  currentOCRResult: null,
  editableState: null,

  isReviewModalOpen: false,
  isScannerModalOpen: false,

  savedDrafts: [],
  selectedDraft: null,

  isConversionModalOpen: false,
  draftToConvert: null,

  openConversionModal: (draft: StructuredReceiptDraft) =>
    set({
      draftToConvert: draft,
      isConversionModalOpen: true,
    }),

  closeConversionModal: () =>
    set({
      isConversionModalOpen: false,
      draftToConvert: null,
    }),

  markDraftConverted: (draftId: string, transactionId: string, operationId: string) => {
    const { savedDrafts, selectedDraft } = get();
    const updatedDrafts = savedDrafts.map((d) => {
      if (d.id === draftId) {
        return {
          ...d,
          status: 'converted' as const,
          convertedToTransactionId: transactionId,
          convertedAt: new Date().toISOString(),
          operationId,
        };
      }
      return d;
    });

    set({
      savedDrafts: updatedDrafts,
      selectedDraft:
        selectedDraft?.id === draftId
          ? {
              ...selectedDraft,
              status: 'converted' as const,
              convertedToTransactionId: transactionId,
              convertedAt: new Date().toISOString(),
              operationId,
            }
          : selectedDraft,
    });
  },

  openScannerModal: () =>
    set({
      isScannerModalOpen: true,
      scanError: null,
      scanProgress: 0,
    }),

  closeScannerModal: () =>
    set({
      isScannerModalOpen: false,
      isScanning: false,
      scanProgress: 0,
    }),

  openReviewModal: (ocrResult: OCRResult) => {
    const editable = ReceiptReviewService.mapOCRResultToEditableState(ocrResult);
    set({
      currentOCRResult: ocrResult,
      editableState: editable,
      isReviewModalOpen: true,
      isScannerModalOpen: false,
    });
  },

  closeReviewModal: () =>
    set({
      isReviewModalOpen: false,
    }),

  setScanning: (isScanning: boolean, progress: number = 0) =>
    set({
      isScanning,
      scanProgress: progress,
    }),

  setScanError: (scanError: string | null) =>
    set({
      scanError,
      isScanning: false,
    }),

  updateEditableField: (key, value) => {
    const { editableState } = get();
    if (!editableState) return;
    set({
      editableState: {
        ...editableState,
        [key]: value,
      },
    });
  },

  updateLineItem: (index, field, value) => {
    const { editableState } = get();
    if (!editableState) return;
    const updatedItems = [...editableState.lineItems];
    if (index >= 0 && index < updatedItems.length) {
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value,
      };

      // Recalculate item total if quantity or price changed
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = ReceiptReviewService.parseNumericInput(
          field === 'quantity' ? value : updatedItems[index].quantity
        );
        const price = ReceiptReviewService.parseNumericInput(
          field === 'unitPrice' ? value : updatedItems[index].unitPrice
        );
        updatedItems[index].totalPrice = qty * price;
      }

      set({
        editableState: {
          ...editableState,
          lineItems: updatedItems,
        },
      });
    }
  },

  addLineItem: () => {
    const { editableState } = get();
    if (!editableState) return;
    const newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
    };
    set({
      editableState: {
        ...editableState,
        lineItems: [...editableState.lineItems, newItem],
      },
    });
  },

  removeLineItem: (index) => {
    const { editableState } = get();
    if (!editableState) return;
    const updatedItems = editableState.lineItems.filter((_, i) => i !== index);
    set({
      editableState: {
        ...editableState,
        lineItems: updatedItems,
      },
    });
  },

  confirmReview: (andOpenConvert?: boolean) => {
    const { editableState, currentOCRResult, savedDrafts } = get();
    if (!editableState) {
      throw new Error('لا توجد بيانات فاتورة قيد المراجعة');
    }

    const structuredDraft = ReceiptReviewService.createStructuredDraft(
      editableState,
      currentOCRResult || undefined
    );

    // Save strictly to local drafts array - DOES NOT CREATE A TRANSACTION
    set({
      savedDrafts: [structuredDraft, ...savedDrafts],
      selectedDraft: structuredDraft,
      isReviewModalOpen: false,
      currentOCRResult: null,
      editableState: null,
      isConversionModalOpen: !!andOpenConvert,
      draftToConvert: andOpenConvert ? structuredDraft : null,
    });

    return structuredDraft;
  },

  resetReview: () => {
    const { currentOCRResult } = get();
    if (currentOCRResult) {
      const resetState = ReceiptReviewService.mapOCRResultToEditableState(currentOCRResult);
      set({ editableState: resetState });
    }
  },

  deleteDraft: (draftId: string) => {
    const { savedDrafts, selectedDraft } = get();
    set({
      savedDrafts: savedDrafts.filter((d) => d.id !== draftId),
      selectedDraft: selectedDraft?.id === draftId ? null : selectedDraft,
    });
  },
}));
