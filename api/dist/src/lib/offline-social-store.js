const socialConnections = new Map();
export function saveOfflineSocialConnection(connection) {
    socialConnections.set(`${connection.tenantId}:${connection.provider}`, connection);
}
export function getOfflineSocialConnection(tenantId, provider) {
    return socialConnections.get(`${tenantId}:${provider}`) || null;
}
