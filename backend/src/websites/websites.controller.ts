import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebsitesService } from './websites.service';
import type { CreateWebsiteDto, UpdateWebsiteDto } from './websites.service';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('websites')
@MienQuyen('danhMuc')
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get()
  async findAll() {
    const data = await this.websitesService.findAll();
    return { data };
  }

  @Get('received')
  async findAllReceived() {
    const data = await this.websitesService.findAllReceived();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.websitesService.findOne(Number(id));
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createDto: CreateWebsiteDto,
    @Request() req: any,
  ) {
    const username = req.user?.username || 'system';
    return this.websitesService.create(createDto, username);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateWebsiteDto,
    @Request() req: any,
  ) {
    const username = req.user?.username || 'system';
    return this.websitesService.update({ ...updateDto, id: Number(id) }, username);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const username = req.user?.username || 'system';
    return this.websitesService.remove(Number(id), username);
  }
}
