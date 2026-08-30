import mongoose, { Schema, model, models } from 'mongoose';

const PrintJobSchema = new Schema(
  {
    jobNumber: { type: String, required: true, unique: true },
    cafeId: { type: String, required: true, index: true },
    fileName: { type: String, default: 'Deleted for Privacy' },
    fileType: { type: String, required: true },
    fileUrl: { type: String, default: null },
    layout: [
      {
        id: String,
        fileUrl: String,
        xPercent: Number,
        yPercent: Number,
        widthPercent: Number,
        heightPercent: Number,
      },
    ],
    pageCount: { type: Number, default: 1 },
    selectedPages: { type: String, default: 'all' },
    colorMode: { type: String, enum: ['bw', 'color'], default: 'bw' },
    paperSize: { type: String, default: 'A4' },
    copies: { type: Number, default: 1 },
    pricePerPage: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, default: 'cash' },
    paymentStatus: { type: String, default: 'pending' },
    printStatus: {
      type: String,
      enum: ['queued', 'pending', 'printing', 'completed', 'cancelled', 'failed'], // <-- Added missing statuses here
      default: 'queued',
    },
    // Automatic DB Cleanup: 24 hours baad expired jobs auto-delete honge
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { timestamps: true }
);

export default models.PrintJob || model('PrintJob', PrintJobSchema);