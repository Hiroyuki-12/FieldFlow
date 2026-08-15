import { IsString, Length } from 'class-validator';

/** Password変更APIで受け付けるJSON本文。2項目とも文字列かつ12〜128文字に限定する。 */
export class ChangePasswordDto {
  // 本人操作であることを確認するため、現在のパスワードも必須にする。
  @IsString()
  @Length(12, 128)
  currentPassword!: string;

  // 新パスワードはServiceでArgon2idハッシュへ変換し、平文のままDB保存しない。
  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
