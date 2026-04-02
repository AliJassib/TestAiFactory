import { OPENROUTER_MODEL } from '../config.js';

/** @type {Map<number, string>} */
const userSelectedModel = new Map();

export function getModelForUser(userId) {
  return userSelectedModel.get(userId) ?? OPENROUTER_MODEL;
}

export function setUserModel(userId, modelId) {
  userSelectedModel.set(userId, modelId);
}

/** يعيد المستخدم إلى الموديل الافتراضي (OPENROUTER_MODEL). */
export function clearUserModel(userId) {
  userSelectedModel.delete(userId);
}
