export interface FirebaseUser {
  uid: string;
  tenantId: string;
  email: string;
  phoneNumber: string;
  emailVerified: string;
  displayName: string;
  photoUrl: string;
  disabled: boolean;
  creationTimestamp: string;
  lastSignInTimestamp: string;
}

export interface LoginResponseData {
  token: string;
  expiresInSecond: number;
  refreshToken: string;
  email: string;
  firebaseUser: FirebaseUser;
  versionConfirm: boolean;
}

export interface LoginResponse {
  result: boolean;
  data: LoginResponseData;
}
