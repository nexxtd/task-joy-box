import React, { useState } from 'react';
import { Input, Select, Card, Tag, Space } from 'antd';
import { SearchOutlined, DownOutlined } from '@ant-design/icons';

const { Option } = Select;

const TicketsPanel: React.FC = () => {
  const [searchValue, setSearchValue] = useState('');
  const [category, setCategory] = useState('All Categories');

  // 模拟数据
  const tickets = [
    {
      id: 1,
      title: 'dsadsadas',
      category: 'SUPPORT',
      date: '03/06/2026',
      status: 'OPEN'
    }
  ];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 状态统计 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Tag color="black" style={{ fontSize: '14px', fontWeight: 'bold' }}>
          Open <span style={{ color: 'white', marginLeft: '4px' }}>1</span>
        </Tag>
        <Tag color="#d9d9d9" style={{ fontSize: '14px', fontWeight: 'bold' }}>
          Resolved <span style={{ color: '#8c8c8c', marginLeft: '4px' }}>3</span>
        </Tag>
      </div>

      {/* 搜索和筛选区域 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Input
          placeholder="Search tickets..."
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={handleSearchChange}
          style={{ flex: 1 }}
        />
        <Select
          value={category}
          onChange={handleCategoryChange}
          suffixIcon={<DownOutlined />}
          style={{ width: 180 }}
        >
          <Option value="All Categories">All Categories</Option>
          <Option value="SUPPORT">Support</Option>
          <Option value="BUG">Bug</Option>
          <Option value="FEATURE">Feature</Option>
        </Select>
      </div>

      {/* 票据列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {tickets.map((ticket) => (
          <Card
            key={ticket.id}
            style={{
              borderRadius: '12px',
              border: '1px solid #e8e8e8',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
              padding: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Space size="middle">
              <Tag color="green" style={{ fontSize: '12px', textTransform: 'uppercase' }}>
                {ticket.category}
              </Tag>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{ticket.title}</span>
            </Space>
            <Space size="middle">
              <span style={{ fontSize: '12px', color: '#8c8c8c' }}>{ticket.date}</span>
              <Tag color="green" style={{ fontSize: '12px', textTransform: 'uppercase' }}>
                {ticket.status}
              </Tag>
            </Space>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TicketsPanel;