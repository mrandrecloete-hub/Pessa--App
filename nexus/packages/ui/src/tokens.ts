/** NEXUS NAMIBIA brand tokens. Exact values from the brand brief. */
export const colors = {
  midnight: '#07111F', darkNavy: '#101D31', navySlate: '#17263B',
  royalBlue: '#2563EB', indigo: '#5B5FEF', cyan: '#22D3EE',
  gold: '#D6A64B', lightGold: '#F0C978', violet: '#8B5CF6',
  text: '#F8FAFC', textSecondary: '#AAB7C8',
  success: '#16A36A', warning: '#E5A13A', error: '#DC5252',
} as const;
export const gradients = {
  navyToBlue: 'linear-gradient(135deg,#07111F 0%,#2563EB 140%)',
  indigoToBlue: 'linear-gradient(135deg,#5B5FEF,#2563EB)',
  navyToCyan: 'linear-gradient(135deg,#101D31,rgba(34,211,238,.18))',
  gold: 'linear-gradient(135deg,#F0C978,#D6A64B)',
} as const;
