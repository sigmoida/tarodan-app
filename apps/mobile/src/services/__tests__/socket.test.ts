import { socketRootUrl } from '../socket';

describe('socketRootUrl', () => {
  it('strips trailing /api from the API base', () => {
    expect(socketRootUrl('http://192.168.1.5:3001/api')).toBe('http://192.168.1.5:3001');
  });
  it('leaves a root url unchanged', () => {
    expect(socketRootUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
});
