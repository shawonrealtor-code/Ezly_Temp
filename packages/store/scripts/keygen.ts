// Prints a new field-encryption key. Put it in the server's environment as EZLY_FIELD_KEY.
// Keep a copy in the password manager: without it, encrypted fields (SSN, driver's license) cannot be read.
import { FieldCipher } from "../src/index.ts";

console.log(FieldCipher.generateKey());
