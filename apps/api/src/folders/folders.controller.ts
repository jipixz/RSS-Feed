import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { FoldersService } from './folders.service';

class CreateFolderDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 30)
  label!: string;
}

@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list() {
    return this.folders.list();
  }

  /** Crear una carpeta/tema nueva (el key se deriva del label). */
  @Post()
  create(@Body() body: CreateFolderDto) {
    return this.folders.create(body.label);
  }

  /** Eliminar una carpeta vacía (sin feeds). */
  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.folders.remove(key);
  }
}
