import mongoose, { Schema, model, models } from 'mongoose';

const CafeSchema = new Schema(
  {
    qrCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    ownerName: { type: String, default: '' },
    loginId: { type: String, default: '' },
    email: { type: String, default: '' },
    password: { type: String, required: true },
    logoUrl: { type: String, default: null },
    pricingConfig: { type: String, default: '{"bw":2,"color":10}' },
    agentSecretKey: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { 
    timestamps: true,
    strict: false // Dynamic fields read karne ke liye essential
  }
);

export default models.Cafe || model('Cafe', CafeSchema);