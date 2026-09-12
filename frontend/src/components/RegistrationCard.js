/**
 * Registration Card Component Representation
 */
export function createRegistrationCardModel({ role, label, description }) {
  return {
    role, // 'reference' | 'target'
    label,
    description,
    file: null,
    previewUrl: null,
    meta: {
      name: '',
      sizeStr: '',
      dimensions: '',
      isValid: false
    }
  };
}
