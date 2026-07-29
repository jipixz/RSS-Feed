import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { ArticlesService } from './articles.service';
import { SummarizerService } from '../ai/summarizer.service';
import { ListArticlesQueryDto } from './dto/list-articles.dto';
import { MarkAllReadDto, SetReadDto, SetStarDto } from './dto/update-flags.dto';

class SemanticQueryDto {
  @IsString()
  @Length(1, 300)
  q!: string;
}

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articles: ArticlesService,
    private readonly summarizer: SummarizerService,
  ) {}

  @Get()
  list(@Query() query: ListArticlesQueryDto) {
    return this.articles.list(query);
  }

  @Post('mark-all-read')
  markAllRead(@Body() body: MarkAllReadDto) {
    return this.articles.markAllRead(body.folder);
  }

  /** Búsqueda semántica en la biblioteca. Va ANTES de :id para no ser capturada. */
  @Get('semantic')
  semantic(@Query() query: SemanticQueryDto) {
    return this.articles.semanticSearch(query.q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.articles.detail(id);
  }

  /** Artículos relacionados por cercanía semántica. */
  @Get(':id/related')
  related(@Param('id') id: string) {
    return this.articles.related(id);
  }

  @Patch(':id/read')
  setRead(@Param('id') id: string, @Body() body: SetReadDto) {
    return this.articles.setRead(id, body.read);
  }

  @Patch(':id/star')
  setStar(@Param('id') id: string, @Body() body: SetStarDto) {
    return this.articles.setStar(id, body.starred);
  }

  /** Trigger explícito de re-generación del TL;DR (única excepción a RN-04). */
  @Post(':id/regenerate-tldr')
  async regenerate(@Param('id') id: string) {
    await this.articles.detail(id); // 404 si no existe
    await this.summarizer.regenerate(id);
    return { ok: true as const };
  }
}
