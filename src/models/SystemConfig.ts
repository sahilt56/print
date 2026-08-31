import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  allowCash: boolean;
  allowOnline: boolean;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    allowCash: { type: Boolean, default: true },
    allowOnline: { type: Boolean, default: false }, // Abhi ke liye False
  },
  { timestamps: true }
);

export const SystemConfig =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);