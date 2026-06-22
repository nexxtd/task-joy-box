import React, { useState } from 'react';
import { Button, Input, List, Tag } from 'antd';
import './TaskView.less';

const TaskView: React.FC = () => {
  const [subtasks, setSubtasks] = useState([
    { id: 1, text: 'sdfasdfdsfsadsadsd', duration: '10 min', completed: true },
    { id: 2, text: 'sadfsdf', duration: '10 min', completed: true },
    { id: 3, text: 'asdsadsad', duration: '15 min', completed: true },
  ]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newDuration, setNewDuration] = useState('10');

  const handleAddSubtask = () => {
    if (newSubtask.trim() !== '') {
      setSubtasks([
        ...subtasks,
        { id: Date.now(), text: newSubtask, duration: `${newDuration} min`, completed: false },
      ]);
      setNewSubtask('');
      setNewDuration('10');
    }
  };

  const handleRemoveSubtask = (id: number) => {
    setSubtasks(subtasks.filter(subtask => subtask.id !== id));
  };

  const totalSubtaskTime = subtasks.reduce((acc, subtask) => {
    const time = parseInt(subtask.duration.split(' ')[0]);
    return acc + time;
  }, 0);

  // 假设主任务时间是45分钟
  const taskDuration = 45;

  // 新增：计算完成的检查项数量（假设每个子任务是一个检查项）
  const completedChecklists = subtasks.filter(t => t.completed).length;
  const totalChecklists = subtasks.length;

  return (
    <div className="task-view">
      <div className="task-header">
        <h2>Set custom duration</h2>
      </div>
      
      {/* Updated task info section */}
      <div className="task-info">
        <div className="status-tags">
          <Tag color="blue">In Progress</Tag>
          <Tag color="default">May 31</Tag>
          <Tag color="default">10h</Tag>
          <Tag color="default">1/2 items</Tag>
          <Tag color="default">2 sub-tasks</Tag>
          <Tag color="gray">Group</Tag>
          <Button type="link" size="small" icon={<i className="icon-settings">⚙️</i>} />
        </div>
      </div>
      
      <div className="subtasks-section">
        <div className="section-title">
          <h3>SUBTASKS</h3>
          {totalSubtaskTime !== taskDuration && (
            <Tag color="orange" icon={<i className="icon-warning">⚠️</i>}>
              Sub-task time does not match task duration
            </Tag>
          )}
          <span className="completion-status">
            {completedChecklists}/{totalChecklists} completed checklists
          </span>
          <span className="completion-status">
            {subtasks.filter(t => t.completed).length}/{subtasks.length} completed sub-tasks
          </span>
        </div>
        
        <List
          dataSource={subtasks}
          renderItem={(item) => (
            <List.Item>
              <div className="subtask-item">
                <Tag color={item.completed ? 'green' : 'default'} className="status-tag">
                  {item.completed ? '✓' : '○'}
                </Tag>
                <span className="subtask-text">{item.text}</span>
                <span className="subtask-duration">{item.duration}</span>
                {!item.completed && (
                  <Button 
                    type="link" 
                    onClick={() => handleRemoveSubtask(item.id)}
                    className="remove-button"
                  >
                    ×
                  </Button>
                )}
              </div>
            </List.Item>
          )}
        />
        
        <div className="add-subtask-container">
          <Input
            placeholder="Add sub-task..."
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onPressEnter={handleAddSubtask}
            style={{ width: 'calc(100% - 120px)' }}
          />
          <Input
            type="number"
            value={newDuration}
            onChange={(e) => setNewDuration(e.target.value)}
            style={{ width: '80px', marginRight: '8px' }}
            suffix="min"
          />
          <Button 
            type="primary" 
            icon={<i className="icon-add">+</i>} 
            onClick={handleAddSubtask}
            disabled={!newSubtask.trim()}
          />
        </div>
      </div>

      {/* Sound controls */}
      <div className="sound-controls">
        <Button type="default" shape="round" size="small">
          <i className="icon-volume">🔊</i> Sound On
        </Button>
        <div className="sound-options">
          <Button type="default" size="small">Lofi</Button>
          <Button type="primary" size="small">Rain</Button>
          <Button type="default" size="small">White Noise</Button>
          <Button type="default" size="small">Cafe</Button>
        </div>
      </div>

      {/* AI Task button */}
      <div className="ai-task-button">
        <Button type="default" shape="round" size="small">
          <i className="icon-ai">✨</i> AI Task
        </Button>
        <Button type="default" shape="round" size="small" icon={<i className="icon-delete">🗑️</i>} />
      </div>
    </div>
  );
};

export default TaskView;