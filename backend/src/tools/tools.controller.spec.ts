import { RecordStatus } from '../database/entities';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

describe('ToolsController', () => {
  const toolsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
  const controller = new ToolsController(
    toolsService as unknown as ToolsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('一覧の検索・ページング条件をServiceへそのまま渡す', async () => {
    const query = {
      search: 'モップ',
      status: RecordStatus.ACTIVE,
      page: 2,
      pageSize: 10,
    };
    toolsService.findAll.mockResolvedValue({ items: [], total: 0 });

    await controller.findAll(query);

    expect(toolsService.findAll).toHaveBeenCalledWith(query);
  });

  it('状態変更で対象IDとversionをServiceへ渡す', async () => {
    const dto = { status: RecordStatus.INACTIVE, version: 3 };
    toolsService.updateStatus.mockResolvedValue({ id: 'tool-id' });

    await controller.updateStatus('tool-id', dto);

    expect(toolsService.updateStatus).toHaveBeenCalledWith('tool-id', dto);
  });
});
