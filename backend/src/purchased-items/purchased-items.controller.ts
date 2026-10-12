import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PurchasedItemsService } from './purchased-items.service';
import { CreatePurchasedItemDto } from './dto/create-purchased-item.dto';
import { UpdatePurchasedItemDto } from './dto/update-purchased-item.dto';
import { QueryPurchasedItemDto, MassUpdatePurchasedItemDto, ShareOrdersDto } from './dto/query-purchased-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Purchased Items Controller
 *
 * Endpoints:
 * - GET /purchased-items - List purchased items with filters
 * - GET /purchased-items/:id - Get purchased item by ID
 * - POST /purchased-items - Create new purchased item
 * - PUT /purchased-items/:id - Update purchased item
 * - DELETE /purchased-items/:id - Delete purchased item
 * - POST /purchased-items/mass-delete - Mass delete
 * - POST /purchased-items/mass-update - Mass update
 * - POST /purchased-items/share - Share orders with totals
 */
@Controller('purchased-items')
@MienQuyen('muaHang')
export class PurchasedItemsController {
  constructor(private readonly purchasedItemsService: PurchasedItemsService) {}

  @Get()
  async findAll(
    @Query() query: QueryPurchasedItemDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    return this.purchasedItemsService.findAll(query);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.purchasedItemsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createPurchasedItemDto: CreatePurchasedItemDto,
    @Request() req: any,
  ): Promise<any> {
    return this.purchasedItemsService.createFromList(createPurchasedItemDto, req.user?.username || 'system');
  }

  @Post('hang-khoan-liet-ke')
  @UseGuards(JwtAuthGuard)
  async createFromList(
    @Body() createPurchasedItemDto: CreatePurchasedItemDto,
    @Request() req: any,
  ): Promise<any> {
    return this.purchasedItemsService.createFromList(createPurchasedItemDto, req.user?.username || 'system');
  }

  @Post('hang-khoan-them')
  @UseGuards(JwtAuthGuard)
  async createFromCreatePage(
    @Body() createPurchasedItemDto: CreatePurchasedItemDto,
    @Request() req: any,
  ): Promise<any> {
    return this.purchasedItemsService.createFromCreatePage(createPurchasedItemDto, req.user?.username || 'system');
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePurchasedItemDto: UpdatePurchasedItemDto,
    @Request() req: any,
  ): Promise<any> {
    return this.purchasedItemsService.update(id, updatePurchasedItemDto, req.user?.username || 'system');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ): Promise<void> {
    return this.purchasedItemsService.remove(id, req.user?.username || 'system');
  }

  @Post('mass-delete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async massDelete(
    @Body() body: { ids: number[] },
    @Request() req: any,
  ): Promise<{ deleted: number }> {
    return this.purchasedItemsService.massDelete(body.ids, req.user?.username || 'system');
  }

  @Post('mass-update')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async massUpdate(
    @Body() massUpdateDto: MassUpdatePurchasedItemDto,
    @Request() req: any,
  ): Promise<{ updated: number }> {
    return this.purchasedItemsService.massUpdate(massUpdateDto, req.user?.username || 'system');
  }

  @Post('share')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async share(
    @Body() shareOrdersDto: ShareOrdersDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    return this.purchasedItemsService.shareOrders(shareOrdersDto, req.user?.username || 'system');
  }
}
