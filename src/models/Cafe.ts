import mongoose, { Schema, model, models } from 'mongoose';

const CafeSchema = new Schema(
  {
    qrCode: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    ownerName: { type: String, default: '' },
    loginId: { type: String, lowercase: true, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    password: { type: String, required: true }, // bcrypt hashed
    logoUrl: { type: String, default: null },
    pricingConfig: { 
      bw: { type: Number, required: true, min: 0, default: 2 },
      color: { type: Number, required: true, min: 0, default: 10 },
    },
    agentSecretKey: { type: String, required: true }, // bcrypt hashed
    agentSecretHashVersion: { type: Number, default: 1 }, // For key rotation support
    isAgentActive: { type: Boolean, default: true },
    lastAgentSeen: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 }, // For rate limiting
    lastFailedLoginAt: { type: Date, default: null }, // For lockout
    lockedUntil: { type: Date, default: null }, // Lockout timestamp
  },
  { 
    timestamps: true,
    strict: true // Remove dynamic fields for security
  }
);

// Indexes for efficient querying
CafeSchema.index({ qrCode: 1, isActive: 1 });
CafeSchema.index({ loginId: 1, isActive: 1 });
CafeSchema.index({ createdAt: -1 }); // For pagination/sorting

export default models.Cafe || model('Cafe', CafeSchema);