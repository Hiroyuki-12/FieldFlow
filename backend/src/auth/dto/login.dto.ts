import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

/**
 * Login APIが受け付けるJSON本文の形。
 * 各デコレータはValidationPipeから実行され、条件違反ならController到達前に400を返す。
 */
export class LoginDto {
  // DB検索前に前後空白と大文字小文字の表記揺れを統一する。
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(4, 50)
  @Matches(/^[a-z0-9._-]+$/)
  // `!`は「ValidationPipeが実行時に値を設定する」とTypeScriptへ伝える記号。
  loginId!: string;

  // Unicodeと空白を許可し、形式的な文字種ルールより長さとArgon2id保護を優先する。
  @IsString()
  @Length(12, 128)
  password!: string;
}
