import { IsEmail, IsNotEmpty } from "class-validator";

/** Identifier-first login: bir e-postanın sistemde olup olmadığını sorar. */
export class CheckEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
