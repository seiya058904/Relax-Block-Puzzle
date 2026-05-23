export function initCloud() {
  return false;
}

export default class AuthClient {
  async login() {
    return {
      loggedIn: false,
      userId: '',
      isMember: false,
      isAdminAllowed: true,
      error: '',
      details: null
    };
  }

  async verifyAdmin() {
    return {
      adminMode: true
    };
  }

  async healthCheck() {
    return {
      ok: false
    };
  }
}
