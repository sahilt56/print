import mongoose, { Schema, model, models } from 'mongoose';

const PrintJobSchema = new Schema(
  {
    jobNumber: { type: String, required: true, unique: true },
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    fileName: { type: String, default: 'Deleted for Privacy' },
    fileType: { type: String, required: true },
    fileUrl: { type: String, default: null },
    cloudinaryPublicId: { type: String, default: null }, // Cloudinary asset identifier
    cloudinaryResourceType: { type: String, default: null },
    cloudinaryFormat: { type: String, default: null },
    cloudinaryVersion: { type: Number, default: null },
    layout: [
      {
        id: String,
        fileUrl: String,
        cloudinaryPublicId: String,
        xPercent: Number,
        yPercent: Number,
        widthPercent: Number,
        heightPercent: Number,
      },
    ],
    pageCount: { type: Number, default: 1, min: 1 },
    selectedPages: { type: String, default: 'all' },
    colorMode: { type: String, enum: ['bw', 'color'], default: 'bw' },
    paperSize: { type: String, enum: ['A4', 'A3', 'Letter'], default: 'A4' },
    copies: { type: Number, default: 1, min: 1 },
    pricePerPage: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'online'], default: 'cash' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending', index: true },
    paymentGatewayOrderId: { type: String, default: null },
    paymentGatewayPaymentId: { type: String, default: null },
    printStatus: {
      type: String,
      enum: ['queued', 'pending', 'claimed', 'printing', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    // Agent tracking for crash recovery
    agentId: { type: String, default: null, index: true },
    claimedAt: { type: Date, default: null },
    lastHeartbeat: { type: Date, default: null },
    attemptCount: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3 },
    // Automatic DB Cleanup: 24 hours baad expired jobs auto-delete honge.
    // This ensures cancelled/failed/successful jobs are retained only for the configured window.
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { timestamps: true }
);

// Compound index for efficient agent job polling
PrintJobSchema.index({ cafeId: 1, paymentStatus: 1, printStatus: 1, createdAt: -1 });

export default models.PrintJob || model('PrintJob', PrintJobSchema);