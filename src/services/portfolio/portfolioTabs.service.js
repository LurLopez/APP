/**
 * @fileoverview Gestión de pestañas personalizadas, grupos temáticos y asignación de activos de la cartera.
 * @module services/portfolio/portfolioTabs
 */

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';

export async function createTab(userId, { name, color }) {
  return portfolioRepository.createTab(userId, { name, color });
}

export async function updateTab(userId, tabId, { name, color }) {
  return portfolioRepository.updateTab(userId, tabId, { name, color });
}

export async function deleteTab(userId, tabId) {
  return portfolioRepository.deleteTab(userId, tabId);
}

export async function createGroup(userId, { tabId, name, color }) {
  return portfolioRepository.createGroup(userId, { tabId, name, color });
}

export async function updateGroup(userId, groupId, { name, color }) {
  return portfolioRepository.updateGroup(userId, groupId, { name, color });
}

export async function deleteGroup(userId, groupId) {
  return portfolioRepository.deleteGroup(userId, groupId);
}

export async function addGroupTicker(userId, groupId, ticker) {
  return portfolioRepository.addGroupTicker(userId, groupId, ticker);
}

export async function removeGroupTicker(userId, groupId, ticker) {
  return portfolioRepository.removeGroupTicker(userId, groupId, ticker);
}

export async function addGroupLot(userId, groupId, transactionId) {
  return portfolioRepository.addGroupLot(userId, groupId, transactionId);
}

export async function removeGroupLot(userId, groupId, transactionId) {
  return portfolioRepository.removeGroupLot(userId, groupId, transactionId);
}
